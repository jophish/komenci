import { Address, Result } from '@celo/base'

export enum EventType {
  // Onboarding service events:
  RelayerProxyInit = 'RelayerProxyInit',
  SessionStart = 'SessionStart',
  SessionStartFailure = 'SessionStartFailure',
  DeployWalletTxSent = 'DeployWalletTxSent',
  PepperRequested = 'PepperRequested',
  AttestationsRequested = 'AttestationsRequested',
  MetaTransactionSubmitted = 'MetaTransactionSubmitted',
  // Relayer service events:
  RelayerMTWInit = 'RelayerMTWInit',
  TxSubmitted = 'TxSubmitted',
  TxConfirmed = 'TxConfirmed',
  TxTimeout = 'TxTimeout',
  RuleVerified = 'RuleVerified',
  RelayerBalance = 'RelayerBalance',
  GasPriceUpdate = 'GasPriceUpdate',
}

export type EventPayload = {
  // Onboarding service events payloads:
  [EventType.RelayerProxyInit]: {
    host: string,
    port: number
  }
  [EventType.SessionStart]: SessionEvent
  [EventType.SessionStartFailure]: SessionEvent
  [EventType.RuleVerified]: AccountEvent & {
    ruleId: string
    result: boolean
  }
  [EventType.DeployWalletTxSent]: SessionEvent & {
    txHash: string
  }
  [EventType.PepperRequested]: SessionEvent & RelayerEvent & {
    blindedPhoneNumber: string
    clientVersion: string
  }
  [EventType.AttestationsRequested]: SessionTxEvent & {
    attestationsRequested: number
    identifier: string
  }
  [EventType.MetaTransactionSubmitted]: SessionTxEvent & {
    destination: Address
    metaTxMethodID: string
    metaTxDestination: Address
  }
  // Relayer service events payloads:
  [EventType.RelayerMTWInit]: {
    mtwAddress: string
  }
  [EventType.TxSubmitted]: TxEvent
  [EventType.TxConfirmed]: TxEvent & {
    isRevert: boolean
    gasPrice: number
    gasUsed: number
    gasCost: number
  }
  [EventType.RelayerBalance]: {
    cUSD: number
    celo: number
  }
  [EventType.TxTimeout]: TxEvent & {
    deadLetterHash: string,
    nonce: number
  },
  [EventType.GasPriceUpdate]: {
    gasPriceGwei: number
  }
}

export type AccountEvent = {
  externalAccount: Address
}

export type SessionEvent = AccountEvent & {
  sessionId: string
}

export type RelayerEvent = {
  relayerAddress: Address
}

export type TxEvent = {
  destination: Address,
  txHash: string
}

export type SessionTxEvent = SessionEvent & {
  relayerAddress: Address
  txHash: string
}


