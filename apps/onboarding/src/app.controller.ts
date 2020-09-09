import { Body, Controller, Get, Post } from '@nestjs/common'
import { GatewayService } from 'apps/onboarding/src/gateway/gateway.service'
import { AppService } from './app.service'
import { StartSessionDto } from './dto/StartSessionDto'
import { RelayerProxyService } from './relayer_proxy.service'

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly relayerProxyService: RelayerProxyService,
    private readonly gatewayService: GatewayService,
  ) {}

  @Post("startSession")
  async startSession(@Body() startSessionDto: StartSessionDto): Promise<any> {
    if (await this.gatewayService.verify(startSessionDto) === true) {
      return {id: 'new-session'}
    } else {
      return {error: 'gateway-not-passed'}
    }
  }

  @Post("deployWallet")
  deployWallet(): any {
    return {id: 'new-session'}
  }

  @Get("distributedBlindedPepper")
  async distributedBlindedPepper() {
    return this.relayerProxyService.signPersonalMessage({
      data: Buffer.alloc(0)
    })
  }

  @Post("startAttestations")
  async startAttestation() {
    return this.relayerProxyService.submitTransaction({tx: {}})
  }

  @Post("completeAttestation")
  async completeAttestation() {
    return this.relayerProxyService.submitTransaction({tx: {}})
  }
}
