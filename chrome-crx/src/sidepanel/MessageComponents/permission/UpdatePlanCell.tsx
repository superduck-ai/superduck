import React, { useCallback, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { useIntlSafe } from '../../../index-react-dom-intl';
import type { ApiToolResultBlock } from '../../../messageTypes';
import { getTextFromBlockContent } from '../../sidepanelUtils';
import type { PlanStructure } from '../../conversation/planMode';
import { ToolUseRow } from '../../toolViews';
import { ChecklistIcon } from '@/sidepanel/components/icons';
import type { ToolInputRecord } from '../../types';
import { PlanApprovalModal } from './PlanApprovalModal';

export const UpdatePlanCell = React.memo(function UpdatePlanCell({
  input,
  toolResult,
  renderMode = 'Standard' as 'Standard' | 'TimelineGroup',
  isFirstBlockOfMessage,
  isLastBlockOfMessage,
  isFirstItemInGroup,
  isLastItemInGroup,
  isStreaming
}: {
  input?: ToolInputRecord;
  toolResult?: ApiToolResultBlock;
  renderMode?: 'Standard' | 'TimelineGroup';
  isFirstBlockOfMessage?: boolean;
  isLastBlockOfMessage?: boolean;
  isFirstItemInGroup?: boolean;
  isLastItemInGroup?: boolean;
  isStreaming?: boolean;
}) {
  const intl = useIntlSafe();
  const [showModal, setShowModal] = useState(false);

  const portalElement = useMemo(() => {
    let el = document.getElementById('modal-portal');
    if (!el) {
      el = document.createElement('div');
      el.id = 'modal-portal';
      document.body.appendChild(el);
    }
    return el;
  }, []);

  const planStructure = useMemo<PlanStructure | null>(() => {
    if (!input) return null;
    return {
      domains: Array.isArray(input.domains)
        ? input.domains.filter((domain): domain is string => typeof domain === 'string')
        : [],
      approach: Array.isArray(input.approach)
        ? input.approach.filter((step): step is string => typeof step === 'string')
        : []
    };
  }, [input]);

  const planStatus = useMemo(() => {
    if (isStreaming || !toolResult) return 'creating';
    if (toolResult?.content) {
      const text = getTextFromBlockContent(toolResult.content);
      if (text.includes('approved') || text.includes('Approved')) return 'approved';
      if (text.includes('rejected') || text.includes('Rejected')) return 'rejected';
    }
    return toolResult?.is_error ? 'rejected' : 'approved';
  }, [toolResult, isStreaming]);

  const handleClick = useCallback(() => {
    if (planStructure) setShowModal(true);
  }, [planStructure]);

  const handleClose = useCallback(() => {
    setShowModal(false);
  }, []);

  let statusText = intl.formatMessage({ id: 'plan', defaultMessage: 'Plan' });
  if (planStatus === 'creating') {
    statusText = intl.formatMessage({ id: 'creating_plan', defaultMessage: 'Creating plan...' });
  } else if (planStatus === 'approved') {
    statusText = intl.formatMessage({ id: 'created_a_plan', defaultMessage: 'Created a plan' });
  } else if (planStatus === 'rejected') {
    statusText = intl.formatMessage({ id: 'plan_rejected', defaultMessage: 'Plan rejected' });
  }

  return (
    <>
      <ToolUseRow
        icon={<ChecklistIcon size={12} className="text-text-500" />}
        text={statusText}
        isStreaming={!!isStreaming}
        hideCaret
        renderMode={renderMode}
        isFirstBlockOfMessage={isFirstBlockOfMessage}
        isLastBlockOfMessage={isLastBlockOfMessage}
        isFirstItemInGroup={isFirstItemInGroup}
        isLastItemInGroup={isLastItemInGroup}
        handleClick={planStructure ? handleClick : undefined}
        isDisabled={!planStructure}
      />
      {showModal &&
        planStructure &&
        ReactDOM.createPortal(
          <PlanApprovalModal
            planStructure={planStructure}
            onApprove={handleClose}
            onReject={handleClose}
            isReadOnly
            onClose={handleClose}
          />,
          portalElement
        )}
    </>
  );
});
