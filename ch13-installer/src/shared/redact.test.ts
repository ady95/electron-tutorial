import { describe, expect, it } from 'vitest';
import { redact } from './redact';

describe('redact', () => {
  it('OpenAI 형식의 키를 가린다', () => {
    expect(redact('Incorrect API key provided: sk-proj-AbCdEf123456')).toBe(
      'Incorrect API key provided: sk-***',
    );
  });
  it('Authorization 헤더와 Bearer 토큰을 가린다', () => {
    expect(redact('authorization: Bearer abcdefgh12345678')).toBe(
      'authorization: Bearer ***',
    );
    expect(redact('{"authorization":"Bearer tok-alice-123"}')).toBe(
      '{"authorization":"Bearer ***"}',
    );
    expect(redact('token Bearer abcdefgh12345678 끝')).toBe(
      'token Bearer *** 끝',
    );
  });
  it('key=값, "token": 값 형태를 가린다', () => {
    expect(redact('api_key=abc123 user=kim')).toBe('api_key=*** user=kim');
    expect(redact('{"token": "secret-value"}')).toBe('{"token": "***"}');
  });
  it('비밀이 없는 문장은 그대로', () => {
    expect(redact('[LLM] rate-limit (시도 1) 요청이 너무 많습니다.')).toBe(
      '[LLM] rate-limit (시도 1) 요청이 너무 많습니다.',
    );
  });
});
