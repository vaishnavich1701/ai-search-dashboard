'use client';

import { useState } from 'react';
import { ThumbsDown, ThumbsUp } from 'lucide-react';

type FeedbackStatus = 'idle' | 'saving' | 'saved' | 'error';

const ratingLabels = {
  1: 'Helpful',
  '-1': 'Not helpful',
} as const;

const AnswerFeedback = ({
  chatId,
  messageId,
}: {
  chatId: string;
  messageId: string;
}) => {
  const [selectedRating, setSelectedRating] = useState<1 | -1 | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [status, setStatus] = useState<FeedbackStatus>('idle');

  const submitFeedback = async (rating: 1 | -1, text = feedbackText) => {
    setSelectedRating(rating);
    setStatus('saving');

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId,
          messageId,
          rating,
          text: text.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || 'Failed to save feedback');
      }

      setStatus('saved');
    } catch (error) {
      console.error('Failed to submit feedback:', error);
      setStatus('error');
    }
  };

  return (
    <div className="mt-2 rounded-xl border border-light-200/60 bg-light-secondary/40 p-3 text-sm dark:border-dark-200/60 dark:bg-dark-secondary/40">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-black/60 dark:text-white/60">
          Was this answer helpful?
        </p>
        <div className="flex gap-2">
          {([1, -1] as const).map((rating) => {
            const active = selectedRating === rating;
            const Icon = rating === 1 ? ThumbsUp : ThumbsDown;

            return (
              <button
                key={rating}
                type="button"
                onClick={() => submitFeedback(rating)}
                disabled={status === 'saving'}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  active
                    ? 'border-sky-500 bg-sky-500/10 text-sky-600 dark:text-sky-300'
                    : 'border-light-200 text-black/70 hover:bg-light-secondary dark:border-dark-200 dark:text-white/70 dark:hover:bg-dark-secondary'
                }`}
                aria-pressed={active}
              >
                <Icon size={14} />
                {ratingLabels[rating]}
              </button>
            );
          })}
        </div>
      </div>

      {selectedRating !== null && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={feedbackText}
            onChange={(event) => setFeedbackText(event.target.value)}
            onBlur={() => submitFeedback(selectedRating, feedbackText)}
            maxLength={2000}
            placeholder="Optional: tell us why"
            className="min-w-0 flex-1 rounded-lg border border-light-200 bg-transparent px-3 py-2 text-xs outline-none focus:border-sky-500 dark:border-dark-200"
          />
          <button
            type="button"
            onClick={() => submitFeedback(selectedRating, feedbackText)}
            disabled={status === 'saving'}
            className="rounded-lg bg-sky-500 px-3 py-2 text-xs font-medium text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Save note
          </button>
        </div>
      )}

      {status === 'saved' && (
        <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-300">
          Thanks — your rating was saved.
        </p>
      )}
      {status === 'error' && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-300">
          Feedback could not be saved. Please try again later.
        </p>
      )}
    </div>
  );
};

export default AnswerFeedback;
