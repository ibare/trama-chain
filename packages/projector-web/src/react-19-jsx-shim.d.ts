/**
 * React 19 호환 — 글로벌 `JSX` 네임스페이스 복원 shim.
 *
 * 배경: `@types/react@19`는 글로벌 `JSX` 네임스페이스 선언을 제거하고 `JSX`를
 * `react` 패키지에서만 노출한다. 이 모노레포는 컴포넌트 시그니처를
 * `: JSX.Element` 형태로 광범위하게 어노테이션해두었기에, React 18→19 전환
 * 시점에 모든 .tsx에 `import type { JSX } from 'react'`를 추가하는 대신 본
 * shim 하나로 글로벌 네임스페이스를 복원한다.
 *
 * 향후 각 컴포넌트를 React 19 권장 패턴(`import type { JSX } from 'react'`)으로
 * 점진 마이그레이션한 뒤 본 파일을 제거하면 된다.
 */
import type { JSX as ReactJSX } from 'react';

declare global {
  namespace JSX {
    type Element = ReactJSX.Element;
    type ElementClass = ReactJSX.ElementClass;
    type ElementAttributesProperty = ReactJSX.ElementAttributesProperty;
    type ElementChildrenAttribute = ReactJSX.ElementChildrenAttribute;
    type IntrinsicAttributes = ReactJSX.IntrinsicAttributes;
    type IntrinsicClassAttributes<T> = ReactJSX.IntrinsicClassAttributes<T>;
    type LibraryManagedAttributes<C, P> = ReactJSX.LibraryManagedAttributes<C, P>;
    type IntrinsicElements = ReactJSX.IntrinsicElements;
  }
}

export {};
