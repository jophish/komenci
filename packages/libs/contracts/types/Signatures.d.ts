/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */

import BN from "bn.js";
import { ContractOptions } from "web3-eth-contract";
import { EventLog } from "web3-core";
import { EventEmitter } from "events";
import {
  Callback,
  PayableTransactionObject,
  NonPayableTransactionObject,
  BlockType,
  ContractEventLog,
  BaseContract,
} from "./types";

interface EventOptions {
  filter?: object;
  fromBlock?: BlockType;
  topics?: string[];
}

export interface Signatures extends BaseContract {
  constructor(
    jsonInterface: any[],
    address?: string,
    options?: ContractOptions
  ): Signatures;
  clone(): Signatures;
  methods: {
    /**
     * Returns the storage, major, minor, and patch version of the contract.
     * @returns The storage, major, minor, and patch version of the contract.
     */
    getVersionNumber(): NonPayableTransactionObject<{
      0: string;
      1: string;
      2: string;
      3: string;
    }>;

    /**
     * Given a signed address, returns the signer of the address.
     * @param message The address that was signed.
     * @param r Output value r of the ECDSA signature.
     * @param s Output value s of the ECDSA signature.
     * @param v The recovery id of the incoming ECDSA signature.
     */
    getSignerOfAddress(
      message: string,
      v: number | string | BN,
      r: string | number[],
      s: string | number[]
    ): NonPayableTransactionObject<string>;

    /**
     * Given a message hash, returns the signer of the address.
     * @param messageHash The hash of a message.
     * @param r Output value r of the ECDSA signature.
     * @param s Output value s of the ECDSA signature.
     * @param v The recovery id of the incoming ECDSA signature.
     */
    getSignerOfMessageHash(
      messageHash: string | number[],
      v: number | string | BN,
      r: string | number[],
      s: string | number[]
    ): NonPayableTransactionObject<string>;

    /**
     * Given a domain separator and a structHash, construct the typed data hash
     * @param eip712DomainSeparator Context specific domain separator
     * @param structHash hash of the typed data struct
     * @returns The EIP712 typed data hash
     */
    toEthSignedTypedDataHash(
      eip712DomainSeparator: string | number[],
      structHash: string | number[]
    ): NonPayableTransactionObject<string>;

    /**
     * Given a domain separator and a structHash and a signature return the signer
     * @param eip712DomainSeparator Context specific domain separator
     * @param r Output value r of the ECDSA signature.
     * @param s Output value s of the ECDSA signature.
     * @param structHash hash of the typed data struct
     * @param v The recovery id of the incoming ECDSA signature.
     */
    getSignerOfTypedDataHash(
      eip712DomainSeparator: string | number[],
      structHash: string | number[],
      v: number | string | BN,
      r: string | number[],
      s: string | number[]
    ): NonPayableTransactionObject<string>;
  };
  events: {
    allEvents(options?: EventOptions, cb?: Callback<EventLog>): EventEmitter;
  };
}
