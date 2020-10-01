import { ValidationPipe } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { assert } from 'console'
import { AppModule } from '../src/app.module'

const request = require('supertest')

describe('AppController (e2e)', () => {
  let app

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    }).compile()

    app = moduleFixture.createNestApplication()
    app.useGlobalPipes(new ValidationPipe())
    await app.init()
  })

  describe('/ (POST) distributedBlindedPepper', () => {
    it('Returns 400 with empty body', async () => {
      return request(app.getHttpServer())
        .post('/distributedBlindedPepper')
        .expect(400)
    })

    it('Returns 400 with invalid phone number', async () => {
      return request(app.getHttpServer())
        .post('/distributedBlindedPepper')
        .send({
          e164Number: 'invalid'
        })
        .expect(400)
        .then(res => {
          assert(res.body.message, ['e164Number must be a valid phone number'])
        })
    })
  })

  afterAll(async () => {
    await app.close()
  })
})
