import { BlockchainService, NodeRPCError, TxPool } from '@app/blockchain/blockchain.service'
import { walletConfig, WalletConfig } from '@app/blockchain/config/wallet.config'
import { KomenciLoggerService } from '@app/komenci-logger'
import { Err, Ok } from '@celo/base/lib/result'
import { ContractKit } from '@celo/contractkit'
import { Test } from '@nestjs/testing'
import { appConfig, AppConfig } from 'apps/relayer/src/config/app.config'
import BigNumber from 'bignumber.js'
import { LoggerModule } from 'nestjs-pino'
import Web3 from 'web3'
import { Transaction, TransactionReceipt } from 'web3-core'
import { TransactionService } from './transaction.service'

jest.mock('@app/blockchain/blockchain.service')
jest.mock('@app/komenci-logger/komenci-logger.service')
jest.mock('@celo/contractkit')

describe('TransactionService', () => {
  const relayerAddress = Web3.utils.randomHex(20)
  // @ts-ignore
  const blockchainService = new BlockchainService()
  // @ts-ignore
  const contractKit = new ContractKit()
  // @ts-ignore
  contractKit.web3 = {
    eth: {
      getTransaction: jest.fn(),
      getTransactionReceipt: jest.fn()
    }
  }

  const setupService = async (
    testAppConfig: Partial<AppConfig>,
    testWalletConfig: Partial<WalletConfig>
  ): Promise<TransactionService>  => {
    const appConfigValue: Partial<AppConfig> = {
      ...testAppConfig
    }

    const walletConfigValue: Partial<WalletConfig> = {
      address: relayerAddress,
      ...testWalletConfig
    }

    const module = await Test.createTestingModule({
      imports: [
        LoggerModule.forRoot(),
      ],
      providers: [
        TransactionService,
        { provide: BlockchainService, useValue: blockchainService},
        { provide: ContractKit, useValue: contractKit },
        { provide: walletConfig.KEY, useValue: walletConfigValue },
        { provide: appConfig.KEY, useValue: appConfigValue },
        KomenciLoggerService,
      ]
    }).compile()

    return module.get<TransactionService>(TransactionService)
  }

  const txFixture = (params?: Partial<Transaction>): Transaction => {
    return {
      hash: Web3.utils.randomHex(40),
      nonce: 1,
      blockHash: null,
      blockNumber: null,
      transactionIndex: null,
      from: Web3.utils.randomHex(20),
      to: Web3.utils.randomHex(20),
      input: "0x0",
      gasPrice: Web3.utils.randomHex(4),
      gas: 100000,
      value: "1000",
      ...(params || {}),
    }
  }

  const txReceiptFixture = (): TransactionReceipt => {
    return {
      gasUsed: 10,
      cumulativeGasUsed: 10,
      blockNumber: null,
      from: Web3.utils.randomHex(20),
      to: Web3.utils.randomHex(20),
      logs: [],
      logsBloom: '',
      status: true,
      transactionHash: null,
      transactionIndex: null,
      blockHash: null,
    }
  }

  const relayerBalanceFixture = () => {
    return {
      CELO: new BigNumber(10),
      cUSD: new BigNumber(100),
      lockedCELO: new BigNumber(0),
      pending: new BigNumber(0),
    }
  }

  const receiptFixture = (tx: Transaction, params?: Partial<TransactionReceipt>): TransactionReceipt => {
    return {
      status: true,
      transactionHash: tx.hash,
      transactionIndex: tx.transactionIndex,
      blockHash: tx.blockHash,
      blockNumber: tx.blockNumber,
      from: tx.from,
      to: tx.to,
      cumulativeGasUsed: 100000,
      gasUsed: 100000,
      logs: [],
      logsBloom: ""
    }
  }

  beforeEach(() => {
    jest.useFakeTimers()
    jest.clearAllTimers()
  })


  it('should be defined', async () => {
    const service = await setupService({}, {})
    expect(service).toBeDefined()
  })

  describe('#onModuleInit', () => {
    describe('when looking up transactions fails', () => {
      it('initializes with an empty set', async () => {
        const getTxPool = jest.spyOn(blockchainService, 'getPendingTxPool').mockResolvedValue(
          Err(new NodeRPCError(new Error("node-rpc-error")))
        )
        const service = await setupService({}, {})
        await service.onModuleInit()

        expect(getTxPool).toHaveBeenCalled()
        // @ts-ignore
        expect(service.watchedTransactions.size).toBe(0)
      })
    })

    describe('when looking up transactions works', () => {
      it('extracts pending transactions from response', async () => {
        const tx = txFixture({
          from: relayerAddress
        })
        const txPoolResponse: TxPool = {
          pending: {
            [Web3.utils.toChecksumAddress(relayerAddress)]: {
              1: tx
            }
          },
          queued: {}
        }
        const getTxPool = jest.spyOn(blockchainService, 'getPendingTxPool').mockResolvedValue(
          Ok(txPoolResponse)
        )
        const service = await setupService({}, {})
        await service.onModuleInit()

        expect(getTxPool).toHaveBeenCalled()
        // @ts-ignore
        expect(service.watchedTransactions.size).toBe(1)
        // @ts-ignore
        expect(service.watchedTransactions.has(tx.hash)).toBeTruthy()
      })
    })
  })

  describe('#submitTransaction', () => {
    let service: TransactionService
    beforeEach(async () => {
      service = await setupService({
        transactionTimeoutMs: 2000,
        transactionCheckIntervalMs: 500
      }, {})
      // @ts-ignore
      jest.spyOn(service, 'getPendingTransactionHashes').mockResolvedValue([])
      await service.onModuleInit()
    })

    describe('when the transaction result resolves', () => {
      it('submits the transaction to the chain, watched then unwatches', async () => {
        const tx = txFixture()
        const receipt = receiptFixture(tx)
        const result: any = {
          getHash: () => Promise.resolve(tx.hash),
          waitReceipt: () => Promise.resolve(receipt)
        }
        const sendTransaction = jest.spyOn(contractKit, 'sendTransaction').mockResolvedValue(result)
        // @ts-ignore
        const watchTransaction = jest.spyOn(service, 'watchTransaction')
        // @ts-ignore
        const unwatchTransaction = jest.spyOn(service, 'unwatchTransaction')
        // @ts-ignore
        const checkTransactions = jest.spyOn(service, 'checkTransactions')
        // Simulate pending tx
        const getTransaction = jest.spyOn(contractKit.web3.eth, 'getTransaction')
        const txPromise = Promise.resolve(tx)
        getTransaction.mockReturnValue(txPromise)

        const rawTx = {
          destination: tx.to,
          data: tx.input,
          value: tx.value
        }

        const hash = await service.submitTransaction(rawTx)

        expect(sendTransaction).toHaveBeenCalledWith(expect.objectContaining({
          to: rawTx.destination,
          data: rawTx.data,
          value: rawTx.value,
          from: relayerAddress
        }))

        expect(watchTransaction).toHaveBeenCalledWith(tx.hash)

        // Ensure the checkTransactions method is called
        jest.advanceTimersToNextTimer(1)
        await txPromise
        expect(checkTransactions).toHaveBeenCalled()

        // Shouldn't remove it from the unwatch list until it's finalized
        await setTimeout(() => {
          expect(unwatchTransaction).not.toHaveBeenCalledWith(tx.hash)
        })

        // Simulate being included in a block and ensure it's unwatched
        const completedTx = txFixture()
        completedTx.hash = tx.hash
        completedTx.blockHash = "notNull"
        const completedTxPromise = Promise.resolve(completedTx)
        getTransaction.mockReturnValue(completedTxPromise)

        const getTransactionReceipt = jest.spyOn(contractKit.web3.eth, 'getTransactionReceipt')
        const txReceiptPromise = Promise.resolve(txReceiptFixture())
        getTransactionReceipt.mockReturnValue(txReceiptPromise)

        const getTotalBalance = jest.spyOn(contractKit, 'getTotalBalance')
        const relayerBalancePromise = Promise.resolve(relayerBalanceFixture())
        getTotalBalance.mockReturnValue(relayerBalancePromise)

        jest.advanceTimersToNextTimer(2)
        await completedTxPromise
        await txReceiptPromise
        await relayerBalancePromise
        await setTimeout(() => {
          expect(unwatchTransaction).toHaveBeenCalledWith(tx.hash)
        })
        jest.advanceTimersToNextTimer(1)
      })
    })

    describe('when the transaction times out', () => {
      it('gets dead lettered when it is expired', async () => {
        const tx = txFixture()
        const receipt = receiptFixture(tx)
        const result: any = {
          getHash: () => Promise.resolve(tx.hash)
        }
        const resultPromise = Promise.resolve(result)
        const sendTransaction = jest.spyOn(contractKit, 'sendTransaction').mockReturnValue(resultPromise)
        // @ts-ignore
        const watchTransaction = jest.spyOn(service, 'watchTransaction')
        // @ts-ignore
        const unwatchTransaction = jest.spyOn(service, 'unwatchTransaction')
        const txPromise = Promise.resolve(tx)
        const getTransaction = jest.spyOn(contractKit.web3.eth, 'getTransaction').mockReturnValue(txPromise)
        // @ts-ignore
        const deadLetter = jest.spyOn(service, 'deadLetter')
        // @ts-ignore
        const checkTransactions = jest.spyOn(service, 'checkTransactions')
        // @ts-ignore
        const finalizeTransaction = jest.spyOn(service, 'finalizeTransaction')
        // @ts-ignore
        const isExpired = jest.spyOn(service, 'isExpired').mockReturnValue(true)

        const rawTx = {
          destination: tx.to,
          data: tx.input,
          value: tx.value
        }

        const hash = await service.submitTransaction(rawTx)

        expect(sendTransaction).toHaveBeenCalledWith(expect.objectContaining({
          to: rawTx.destination,
          data: rawTx.data,
          value: rawTx.value,
          from: relayerAddress
        }))

        expect(watchTransaction).toHaveBeenCalledWith(tx.hash)
        expect(unwatchTransaction).not.toHaveBeenCalled()

        jest.advanceTimersToNextTimer(1)

        expect(checkTransactions).toHaveBeenCalled()
        expect(finalizeTransaction).not.toHaveBeenCalled()
        await txPromise
        await resultPromise
        await result.getHash()
        await setTimeout(() => {
          expect(deadLetter).toHaveBeenCalledWith(expect.objectContaining(tx))
          expect(unwatchTransaction).toHaveBeenCalledWith(tx.hash)
          expect(watchTransaction.mock.calls.length).toBe(2)
        })
        jest.advanceTimersToNextTimer(1)
      })
    })
  })
})
