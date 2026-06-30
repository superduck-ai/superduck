import { beforeEach, describe, expect, it } from 'vitest';
import { useAttachmentStore } from './attachmentStore';

const attachment = (id: string) => ({
  id,
  base64: 'iVBORw0KGgo=',
  mediaType: 'image/png',
  fileName: `${id}.png`
});

describe('useAttachmentStore', () => {
  beforeEach(() => {
    useAttachmentStore.setState({
      pendingAttachments: [],
      previewAttachmentImage: null,
      screenshotPreviewUrl: null,
      attachmentCount: 0
    });
  });

  it('clears the preview when the last attachment is removed', () => {
    useAttachmentStore.setState({
      pendingAttachments: [attachment('one')],
      previewAttachmentImage: 'data:image/png;base64,iVBORw0KGgo=',
      attachmentCount: 1
    });

    useAttachmentStore.getState().removeAttachment('one');

    expect(useAttachmentStore.getState().pendingAttachments).toEqual([]);
    expect(useAttachmentStore.getState().attachmentCount).toBe(0);
    expect(useAttachmentStore.getState().previewAttachmentImage).toBeNull();
  });

  it('keeps the preview while attachments remain', () => {
    const preview = 'data:image/png;base64,iVBORw0KGgo=';
    useAttachmentStore.setState({
      pendingAttachments: [attachment('one'), attachment('two')],
      previewAttachmentImage: preview,
      attachmentCount: 2
    });

    useAttachmentStore.getState().removeAttachment('one');

    expect(useAttachmentStore.getState().pendingAttachments).toEqual([attachment('two')]);
    expect(useAttachmentStore.getState().attachmentCount).toBe(1);
    expect(useAttachmentStore.getState().previewAttachmentImage).toBe(preview);
  });
});
