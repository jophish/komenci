import { isAccountConsideredVerified } from '@celo/base/lib'
import { EventLog } from '@celo/connect'
import { CeloContract, ContractKit } from '@celo/contractkit'
import { AnalyticsService } from '@komenci/analytics'
import { networkConfig, NetworkConfig } from '@komenci/core'
import {
  EventType,
  InviteNotRewardedReason,
  KomenciLoggerService
} from '@komenci/logger'
import { Inject, Injectable } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { In, Not, Raw } from 'typeorm'
import { v4 as uuidv4 } from 'uuid'
import { AddressMappingsRepository } from '../addressMappings/addressMappings.repository'
import { AttestationRepository } from '../attestation/attestation.repository'
import { StartingBlock } from '../blocks/notifiedBlock.service'
import { appConfig, AppConfig } from '../config/app.config'
import { EventService } from '../event/eventService.service'
import { InviteReward, RewardStatus } from './inviteReward.entity'
import { InviteRewardRepository } from './inviteReward.repository'
import { RewardSenderService } from './rewardSender.service'

const NOTIFIED_BLOCK_KEY = 'inviteReward'
const WEEKLY_INVITE_LIMIT = 20
const WITHDRAWAL_EVENT = 'Withdrawal'

@Injectable()
export class InviteRewardService {
  isRunning = false
  komenciAddresses = []
  cUsdTokenAddress = null
  cEurTokenAddress = null

  constructor(
    private readonly inviteRewardRepository: InviteRewardRepository,
    private readonly attestationRepository: AttestationRepository,
    private readonly addressMappingsRepository: AddressMappingsRepository,
    private readonly rewardSenderService: RewardSenderService,
    private readonly eventService: EventService,
    private readonly contractKit: ContractKit,
    @Inject(networkConfig.KEY)
    private readonly networkCfg: NetworkConfig,
    @Inject(appConfig.KEY)
    private readonly appCfg: AppConfig,
    private readonly logger: KomenciLoggerService,
    private readonly analytics: AnalyticsService
  ) {
    this.komenciAddresses = this.networkCfg.relayers.map(
      (relayer) => relayer.externalAccount
    )
  }

  // This cron job will fetch Escrow events from Forno, run checks to see if we should send the inviter
  // a reward and send it if so.
  // Since there may be several instances of this service, we need to make sure we don't send more than
  // one reward for the same invitee. The invitee record is unique on the database, so any attempt to
  // create a new row with the same one will fail.
  @Cron(CronExpression.EVERY_10_SECONDS)
  async sendInviteRewards() {
    if (!this.appCfg.shouldSendRewards) {
      this.logger.log(
        'Skipping sending reward because SHOULD_SEND_REWARDS env var is false'
      )
      return
    }
    this.cUsdTokenAddress = (
      await this.contractKit.registry.addressFor(CeloContract.StableToken)
    ).toLowerCase()
    this.cEurTokenAddress = (
      await this.contractKit.registry.addressFor(CeloContract.StableTokenEUR)
    ).toLowerCase()

    await this.eventService.runEventProcessingPolling(
      NOTIFIED_BLOCK_KEY,
      await this.contractKit.contracts.getEscrow(),
      WITHDRAWAL_EVENT,
      StartingBlock.Latest,
      this.handleWithdrawalEvent.bind(this),
      this.logEventsReceived.bind(this)
    )
  }

  logEventsReceived(fromBlock: number, eventCount: number) {
    this.logger.event(EventType.EscrowWithdrawalEventsFetched, {
      eventCount,
      fromBlock
    })
  }

  async handleWithdrawalEvent(withdrawalEvent: EventLog) {
    const {
      transactionHash,
      returnValues: { identifier, token, to, paymentId }
    } = withdrawalEvent

    const inviter = to.toLowerCase()
    if (![this.cUsdTokenAddress, this.cEurTokenAddress].includes(token.toLowerCase())) {
      this.analytics.trackEvent(EventType.InviteNotRewarded, {
        txHash: transactionHash,
        inviter,
        invitee: null,
        paymentId,
        reason: InviteNotRewardedReason.NotStableTokenInvite
      })
      return
    }
    const tx = await this.contractKit.web3.eth.getTransaction(transactionHash)
    const invitee = tx.to?.toLowerCase()
    if (!invitee) {
      this.analytics.trackEvent(EventType.InviteNotRewarded, {
        txHash: transactionHash,
        inviter,
        invitee: null,
        paymentId,
        reason: InviteNotRewardedReason.NoInviteeFound
      })
      return
    }
    if (!this.isKomenciSender(tx.from)) {
      this.analytics.trackEvent(EventType.InviteNotRewarded, {
        txHash: transactionHash,
        inviter,
        invitee,
        paymentId,
        reason: InviteNotRewardedReason.NotKomenciRedeem
      })
      return
    }
    if (
      await this.inviteRewardConditionsAreMet(
        inviter,
        invitee,
        identifier,
        paymentId,
        transactionHash
      )
    ) {
      const inviteReward = await this.createInviteReward(
        inviter,
        invitee,
        identifier,
        paymentId,
        transactionHash
      )
      if (inviteReward) {
        // The error is handled in the reward sender service, just firing off the
        // sending here and catching to apease the linter.
        this.rewardSenderService.sendInviteReward(inviteReward).catch()
      }
    }
  }

  isKomenciSender(address: string) {
    return this.komenciAddresses.includes(address.toLowerCase())
  }

  async inviteRewardConditionsAreMet(
    inviter: string,
    invitee: string,
    identifier: string,
    paymentId: string,
    txHash: string
  ) {
    const checks = [
      {
        condition: this.isAddressVerified(inviter),
        error: InviteNotRewardedReason.InviterNotVerified
      },
      {
        condition: this.isAddressVerifiedWithIdentifier(invitee, identifier),
        error: InviteNotRewardedReason.InviteeNotVerified
      },
      {
        condition: this.inviterHasNotReachedWeeklyLimit(inviter),
        error: InviteNotRewardedReason.InviterReachedWeeklyLimit
      },
      {
        condition: this.inviteeRewardNotInProgress(invitee),
        error: InviteNotRewardedReason.InviteeAlreadyInvited
      }
    ]
    const results = await Promise.all(checks.map((check) => check.condition))
    let conditionsAreMet = true
    for (let i = 0; i < results.length; i++) {
      if (!results[i]) {
        this.analytics.trackEvent(EventType.InviteNotRewarded, {
          txHash,
          inviter,
          invitee,
          paymentId,
          reason: checks[i].error
        })
        conditionsAreMet = false
      }
    }
    return conditionsAreMet
  }

  async isAddressVerified(address: string) {
    const accountAddresses = await this.addressMappingsRepository.findAccountAddresses(
      address
    )
    const attestations = await this.attestationRepository
      .createQueryBuilder()
      .select('DISTINCT identifier, address')
      .where({ address: In(accountAddresses) })
      .getRawMany()
    // TODO: Use Promise.any once it's available to do this in parallel.
    for (const attestation of attestations) {
      if (
        await this.isAddressVerifiedWithIdentifier(
          attestation.address,
          attestation.identifier
        )
      ) {
        return true
      }
    }
    return false
  }

  async isAddressVerifiedWithIdentifier(address: string, identifier: string) {
    const attestations = await this.contractKit.contracts.getAttestations()
    const attestationStat = await attestations.getAttestationStat(
      identifier,
      address
    )
    return isAccountConsideredVerified(attestationStat).isVerified
  }

  async inviterHasNotReachedWeeklyLimit(inviter: string) {
    const [_, invites] = await this.inviteRewardRepository.findAndCount({
      where: {
        inviter,
        state: Not(RewardStatus.Failed),
        createdAt: Raw(
          (alias) =>
            `${alias} >= date_trunc('week', current_date) AT TIME ZONE 'UTC'`
        )
      }
    })
    return invites < WEEKLY_INVITE_LIMIT
  }

  async inviteeRewardNotInProgress(invitee: string) {
    const reward = await this.inviteRewardRepository.findOne({ invitee })
    return !reward
  }

  async createInviteReward(
    inviter: string,
    invitee: string,
    inviteeIdentifier: string,
    paymentId: string,
    txHash: string
  ) {
    try {
      const inviteReward = InviteReward.of({
        id: uuidv4(),
        inviter,
        invitee,
        inviteeIdentifier,
        state: RewardStatus.Created,
        createdAt: new Date(Date.now()).toISOString()
      })
      const savedReward = await this.inviteRewardRepository.save(inviteReward)
      this.analytics.trackEvent(EventType.InviteRewardCreated, {
        txHash,
        inviteId: inviteReward.id,
        inviter,
        invitee,
        paymentId
      })
      return savedReward
    } catch (error) {
      // Ignore expected error
      if (
        !error.message.includes(
          'duplicate key value violates unique constraint'
        )
      ) {
        this.analytics.trackEvent(EventType.UnexpectedError, {
          origin: `Creating invite reward for tx hash ${txHash}`,
          error: error
        })
      }
    }
  }
}
