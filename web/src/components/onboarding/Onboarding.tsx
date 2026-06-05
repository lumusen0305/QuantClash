import { useCallback, useEffect, useState } from 'react';
import styles from './Onboarding.module.css';
import { useI18n } from '../../i18n/context';

interface OnboardingProps {
  /** Called when the user dismisses (skip / close / esc / backdrop). */
  onClose: () => void;
  /** Called when the user finishes via the primary "Get started" button. */
  onComplete: () => void;
}

interface Slide {
  icon: string;
  kicker: string;
  title: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    icon: '◎',
    kicker: 'onb.kicker.welcome',
    title: 'onb.s1.title',
    body: 'onb.s1.body',
  },
  {
    icon: '☑',
    kicker: 'onb.kicker.today',
    title: 'onb.s2.title',
    body: 'onb.s2.body',
  },
  {
    icon: '⌕',
    kicker: 'onb.kicker.explore',
    title: 'onb.s3.title',
    body: 'onb.s3.body',
  },
  {
    icon: '✎',
    kicker: 'onb.kicker.journal',
    title: 'onb.s4.title',
    body: 'onb.s4.body',
  },
];

export default function Onboarding({ onClose, onComplete }: OnboardingProps) {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const isLast = index === SLIDES.length - 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const next = useCallback(() => {
    if (isLast) {
      onComplete();
    } else {
      setIndex((i) => Math.min(i + 1, SLIDES.length - 1));
    }
  }, [isLast, onComplete]);

  const slide = SLIDES[index];

  return (
    <div
      className={styles.backdrop}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onb-title"
      >
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label={t('common.close')}
        >
          ×
        </button>

        <div className={styles.body}>
          <div key={index} className={styles.slideEnter}>
            <p className={styles.kicker}>{t(slide.kicker)}</p>
            <div className={styles.slideIcon} aria-hidden="true">
              {slide.icon}
            </div>
            <h2 id="onb-title" className={styles.slideTitle}>
              {t(slide.title)}
            </h2>
            <p className={styles.slideBody}>{t(slide.body)}</p>
          </div>
        </div>

        <div className={styles.footer}>
          <div className={styles.dots}>
            {SLIDES.map((_, i) => (
              <button
                type="button"
                key={i}
                className={`${styles.dot} ${i === index ? styles.dotActive : ''}`}
                onClick={() => setIndex(i)}
                aria-label={`${t('onb.slide')} ${i + 1}`}
                aria-current={i === index}
              />
            ))}
          </div>
          {!isLast && (
            <button type="button" className={styles.skip} onClick={onClose}>
              {t('onb.skip')}
            </button>
          )}
          <button type="button" className={styles.primary} onClick={next}>
            {isLast ? t('onb.start') : t('onb.next')}
          </button>
        </div>
      </div>
    </div>
  );
}
