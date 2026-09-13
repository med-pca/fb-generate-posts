import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(private readonly config: ConfigService) {}

  login(dto: LoginDto) {
    const username = this.required('ADMIN_USERNAME');
    const password = this.required('ADMIN_PASSWORD');
    if (!this.equal(dto.username, username) || !this.equal(dto.password, password)) {
      throw new UnauthorizedException('Identifiants incorrects');
    }
    const expiresAt = Date.now() + 12 * 60 * 60 * 1000;
    const payload = Buffer.from(
      JSON.stringify({ sub: username, exp: expiresAt, nonce: randomBytes(12).toString('hex') }),
    ).toString('base64url');
    return { accessToken: `${payload}.${this.sign(payload)}`, expiresAt };
  }

  verify(token: string) {
    const [payload, signature] = token.split('.');
    if (!payload || !signature || !this.equal(signature, this.sign(payload))) return false;
    try {
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { exp?: number };
      return typeof data.exp === 'number' && data.exp > Date.now();
    } catch { return false; }
  }

  private sign(payload: string) {
    return createHmac('sha256', this.required('AUTH_SECRET')).update(payload).digest('base64url');
  }

  private equal(left: string, right: string) {
    const a = createHmac('sha256', 'compare').update(left).digest();
    const b = createHmac('sha256', 'compare').update(right).digest();
    return timingSafeEqual(a, b);
  }

  private required(name: string) {
    const value = this.config.get<string>(name);
    if (!value) throw new ServiceUnavailableException(`${name} doit être configuré`);
    return value;
  }
}
