import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import thirdPartyConfig from '../../config/third-party.config';

@Injectable()
export class SafetyNetService {
  constructor(
    @Inject(thirdPartyConfig.KEY)
    private config: ConfigType<typeof thirdPartyConfig>
  ) {}

  // TODO determine what the propper input is for this
  async verifyDevice(input: any): Promise<boolean> {
    // this.config.androidSafetyNetToken -> the token
    return false
  }
}
