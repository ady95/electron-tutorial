import { useReducer } from 'react';

// 문서 하나의 상태: 이름, 현재 내용, 마지막으로 저장된 내용
export interface DocumentState {
  name: string;
  text: string;
  savedText: string;
}

type Action =
  | { type: 'edit'; text: string }
  | { type: 'new' }
  | { type: 'loaded'; name: string; text: string }
  | { type: 'saved'; name: string };

const initialState: DocumentState = {
  name: '제목 없음',
  text: '',
  savedText: '',
};

function reducer(state: DocumentState, action: Action): DocumentState {
  switch (action.type) {
    case 'edit':
      return { ...state, text: action.text };
    case 'new':
      return initialState;
    case 'loaded':
      return { name: action.name, text: action.text, savedText: action.text };
    case 'saved':
      return { ...state, name: action.name, savedText: state.text };
  }
}

export function useDocument() {
  const [doc, dispatch] = useReducer(reducer, initialState);
  // 저장된 내용과 다르면 "수정됨"(dirty) 상태
  const dirty = doc.text !== doc.savedText;
  return { doc, dirty, dispatch };
}
