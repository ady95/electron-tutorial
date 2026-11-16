// 텍스트 파일의 바이트를 문자열로 바꾸는 순수 함수 (Electron·Node API를 쓰지 않는다)

export interface DecodedText {
  text: string;
  encoding: 'utf-8' | 'utf-16le' | 'euc-kr';
}

// 한국어 텍스트 파일은 UTF-8 말고도 메모장의 옛 기본값(ANSI = CP949)으로 저장된 것이 많다.
// 1) BOM이 있으면 그대로 따르고 2) UTF-8로 엄격하게 읽어 보고 3) 실패하면 EUC-KR(CP949)로 읽는다
export function decodeText(bytes: Uint8Array): DecodedText {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return {
      text: normalize(new TextDecoder('utf-8').decode(bytes.subarray(3))),
      encoding: 'utf-8',
    };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return {
      text: normalize(new TextDecoder('utf-16le').decode(bytes.subarray(2))),
      encoding: 'utf-16le',
    };
  }
  try {
    return {
      text: normalize(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
      encoding: 'utf-8',
    };
  } catch {
    // WHATWG 표준의 euc-kr 디코더는 CP949(확장 완성형)까지 읽는다
    return {
      text: normalize(new TextDecoder('euc-kr').decode(bytes)),
      encoding: 'euc-kr',
    };
  }
}

// 줄바꿈을 \n 하나로 통일한다
function normalize(text: string) {
  return text.replace(/\r\n?/g, '\n');
}
