import React, { useCallback, useEffect, useState } from 'react';
import { MemoizedFormattedMessage, useIntlSafe } from '../../../index-react-dom-intl';
import { getDomainDisplayName } from '../../conversation/planMode';
import type { PlanStructure } from '../../conversation/planMode';
import { Tooltip } from '@/sidepanel/components/Tooltip';
import {
  ChecklistIcon,
  GlobeIcon,
  InfoCircleIcon,
  PlatformModifierKey,
  ReturnKeyIcon
} from '@/sidepanel/components/icons';
import { PermissionActionButton } from './PermissionActionButton';

export function PlanApprovalModal({
  planStructure,
  onApprove,
  onReject,
  isReadOnly = false,
  onClose
}: {
  planStructure: PlanStructure;
  onApprove: () => void;
  onReject: () => void;
  isReadOnly?: boolean;
  onClose?: () => void;
}) {
  const intl = useIntlSafe();
  const [activeButton, setActiveButton] = useState<string | null>(null);

  const handleApprove = useCallback(() => {
    onApprove();
  }, [onApprove]);

  const handleReject = useCallback(() => {
    onReject();
  }, [onReject]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget && isReadOnly && onClose) {
        onClose();
      }
    },
    [isReadOnly, onClose]
  );

  useEffect(() => {
    if (isReadOnly) {
      const handler = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && onClose) onClose();
      };
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    } else {
      const handler = (e: KeyboardEvent) => {
        if (e.isComposing) return;
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          setActiveButton('reject');
          setTimeout(() => handleReject(), 150);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          setActiveButton('approve');
          setTimeout(() => handleApprove(), 150);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          setActiveButton('reject');
          setTimeout(() => handleReject(), 150);
        }
      };
      window.addEventListener('keydown', handler, true);
      return () => window.removeEventListener('keydown', handler, true);
    }
  }, [handleApprove, handleReject, isReadOnly, onClose]);

  const { domains = [], approach = [] } = planStructure;

  const modalContent = (
    <div className="bg-bg-000 rounded-[14px]">
      {/* Header */}
      <div className="flex items-center justify-between py-[10px] px-4">
        <div className="flex items-center gap-2">
          <ChecklistIcon size={20} className="text-text-100" />
          <h3 className="font-base text-text-100">
            <MemoizedFormattedMessage id="superducks_plan" defaultMessage="SuperDuck's plan" />
          </h3>
        </div>
        {isReadOnly && onClose && (
          <button
            onClick={onClose}
            className="text-text-400 hover:text-text-200 transition-colors duration-200 p-1 rounded-md hover:bg-bg-200"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M15 5L5 15M5 5L15 15"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-border-300" />

      {/* Content */}
      <div className="px-4 py-3 space-y-4 max-h-[40vh] overflow-y-auto">
        {/* Domains section */}
        {domains.length > 0 && (
          <div>
            <p className="font-small text-text-400 mb-2">
              <MemoizedFormattedMessage
                id="allow_actions_on_these_sites"
                defaultMessage="Allow actions on these sites"
              />
            </p>
            <div className="space-y-2">
              {domains.map((domain, index) => {
                const name = getDomainDisplayName(domain);
                const isForceAsk = typeof domain !== 'string' && domain.category === 'category3';
                return (
                  <div key={index} className="flex items-start gap-2">
                    <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                      <GlobeIcon size={16} className="text-text-400" />
                    </span>
                    <span className="font-base text-text-100">{name}</span>
                    {isForceAsk && (
                      <Tooltip
                        tooltipContent={intl.formatMessage({
                          id: 'you_must_approve_any_superduck_action_on_this',
                          defaultMessage: 'You must approve any SuperDuck action on this site'
                        })}
                        side="top"
                      >
                        <span className="flex-shrink-0 cursor-help">
                          <InfoCircleIcon size={14} className="text-text-400" />
                        </span>
                      </Tooltip>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Approach section */}
        {approach.length > 0 && (
          <div>
            <p className="font-small text-text-400 mb-2">
              <MemoizedFormattedMessage
                id="approach_to_follow"
                defaultMessage="Approach to follow"
              />
            </p>
            <div className="space-y-2">
              {approach.map((step, index) => (
                <div key={index} className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full border-border-300 border-0.5 flex items-center justify-center text-xs text-text-400">
                    {index + 1}
                  </span>
                  <span className="font-base text-text-100">{step}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Action buttons (only when not read-only) */}
      {!isReadOnly && (
        <div className="px-3 py-[10px] space-y-[5px] mt-[10px]">
          <PermissionActionButton
            onClick={handleApprove}
            isPrimary
            isActive={activeButton === 'approve'}
          >
            <span>
              <MemoizedFormattedMessage id="approve_plan" defaultMessage="Approve plan" />
            </span>
            <ReturnKeyIcon className="text-text-500" />
          </PermissionActionButton>
          <PermissionActionButton onClick={handleReject} isActive={activeButton === 'reject'}>
            <span>
              <MemoizedFormattedMessage id="make_changes" defaultMessage="Make changes" />
            </span>
            <span className="flex items-center gap-0.5">
              <PlatformModifierKey className="text-text-500" />
              <ReturnKeyIcon className="text-text-500" />
            </span>
          </PermissionActionButton>
          <p className="font-small text-text-500 pt-1 px-1">
            <MemoizedFormattedMessage
              id="superduck_will_only_use_the_sites_listed_youll"
              defaultMessage="SuperDuck will only use the sites listed. You'll be asked before accessing anything else."
            />
          </p>
        </div>
      )}
    </div>
  );

  if (isReadOnly) {
    return (
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center p-4"
        onClick={handleBackdropClick}
      >
        <div
          className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in cursor-pointer"
          onClick={handleBackdropClick}
        />
        <div
          className="relative max-w-lg w-full animate-modal-enter"
          onClick={(e) => e.stopPropagation()}
        >
          {modalContent}
        </div>
      </div>
    );
  }

  return modalContent;
}
