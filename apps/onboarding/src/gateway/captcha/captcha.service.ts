import { Err, Ok, Result, RootError } from '@celo/base/lib/result'
import {
  HttpService,
  Inject,
  Injectable,
} from '@nestjs/common'
import { thirdPartyConfig, ThirdPartyConfig } from '../../config/third-party.config'
import { HttpRequestError } from '../../errors/http'
import { ErrorCode, ReCAPTCHAResponseDto } from './ReCAPTCHAResponseDto'

export enum ReCAPTCHAErrorTypes {
  VerificationFailed = 'VerificationFailed'
}

export class CaptchaVerificationFailed extends RootError<ReCAPTCHAErrorTypes> {
  constructor(public errorCodes: ErrorCode[]) {
    super(ReCAPTCHAErrorTypes.VerificationFailed)
  }
}

export type CaptchaServiceErrors = CaptchaVerificationFailed | HttpRequestError

@Injectable()
export class CaptchaService {
  constructor(
    @Inject(thirdPartyConfig.KEY)
    private config: ThirdPartyConfig,
    private httpService: HttpService
  ) {}

  async verifyCaptcha(
    token: string
  ): Promise<Result<boolean, CaptchaServiceErrors>> {
    return this.httpService
      .get<ReCAPTCHAResponseDto>(this.config.recaptchaUri, {
        params: {
          secret: this.config.recaptchaToken,
          response: token
        }
      })
      .toPromise()
      .then(({ data }) => {
        if (data.success === true) {
          return Ok(true)
        } else {
          return Err(new CaptchaVerificationFailed(data['error-codes']))
        }
      })
      .catch(error => {
        return Err(new HttpRequestError(error))
      })
  }
}
