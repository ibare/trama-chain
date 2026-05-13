import { Children, useCallback, useEffect, useState, type ReactNode } from 'react';
import useEmblaCarousel from 'embla-carousel-react';

/**
 * 인스펙터·픽커 섹션 전용 좌우 페이징 캐러셀.
 *
 * - embla-carousel-react로 회전목마식 스냅 페이징. 마우스 드래그 + 좌우 버튼.
 * - 컨텐츠가 viewport에 들어차면 prev/next 버튼이 비활성화돼 layout이 안 흔들림.
 * - 자식이 바뀌면 reInit으로 슬라이드 목록을 다시 계산.
 *
 * 슬라이드 크기는 자식이 결정 (`flex: 0 0 auto`).
 * 각 섹션이 독립이므로 한 패널 안에 여러 캐러셀이 공존 가능.
 */

interface Props {
  children: ReactNode;
  className?: string;
  /** 캐러셀의 시각적 라벨(aria) — "단위 카테고리" 등. */
  ariaLabel?: string;
}

export function TramaCarousel({ children, className, ariaLabel }: Props): JSX.Element {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: 'start',
    slidesToScroll: 'auto',
    containScroll: 'trimSnaps',
    loop: false,
  });
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const slides = Children.toArray(children);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.reInit();
  }, [emblaApi, slides.length]);

  useEffect(() => {
    if (!emblaApi) return;
    const update = (): void => {
      setCanPrev(emblaApi.canScrollPrev());
      setCanNext(emblaApi.canScrollNext());
    };
    emblaApi.on('select', update);
    emblaApi.on('reInit', update);
    update();
    return () => {
      emblaApi.off('select', update);
      emblaApi.off('reInit', update);
    };
  }, [emblaApi]);

  const prev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const next = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  return (
    <div className={`trama-carousel${className ? ` ${className}` : ''}`} aria-label={ariaLabel}>
      <button
        type="button"
        className="trama-carousel-btn trama-carousel-prev"
        onClick={prev}
        disabled={!canPrev}
        aria-label="이전"
      >
        ‹
      </button>
      <div className="trama-carousel-viewport" ref={emblaRef}>
        <div className="trama-carousel-track">
          {slides.map((child, i) => (
            <div key={i} className="trama-carousel-slide">
              {child}
            </div>
          ))}
        </div>
      </div>
      <button
        type="button"
        className="trama-carousel-btn trama-carousel-next"
        onClick={next}
        disabled={!canNext}
        aria-label="다음"
      >
        ›
      </button>
    </div>
  );
}
