import type { ApiConversationMessage } from '../../messageTypes';
import {
  isImageContentBlock,
  isTextContentBlock,
  isToolResultContentBlock
} from '../../messageTypes';
import { parseDimension } from './types';

export function findImageInMessages(
  messages: ApiConversationMessage[],
  imageId: string
): { base64: string; width?: number; height?: number } | undefined {
  console.info(`[imageUtils] Looking for image with ID: ${imageId}`);
  console.info(`[imageUtils] Total messages to search: ${messages.length}`);

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if ('user' === message.role && Array.isArray(message.content)) {
      for (const block of message.content) {
        if (isToolResultContentBlock(block)) {
          const toolResult = block;
          if (toolResult.content) {
            const contentParts = Array.isArray(toolResult.content)
              ? toolResult.content
              : [{ type: 'text', text: toolResult.content }];
            let foundIdInText = false;
            let matchingText = '';
            for (const part of contentParts) {
              if (isTextContentBlock(part) && part.text.includes(imageId)) {
                foundIdInText = true;
                matchingText = part.text;
                console.info('[imageUtils] Found image ID in tool_result text');
                break;
              }
            }
            if (foundIdInText) {
              for (const part of contentParts) {
                if (isImageContentBlock(part)) {
                  const imagePart = part;
                  if (imagePart.source && 'data' in imagePart.source && imagePart.source.data) {
                    console.info(`[imageUtils] Found image data for ID ${imageId}`);
                    return {
                      base64: imagePart.source.data,
                      width: parseDimension(matchingText, 'width'),
                      height: parseDimension(matchingText, 'height')
                    };
                  }
                }
              }
            }
          }
        }
      }

      const textIndex = message.content.findIndex(
        (block) => isTextContentBlock(block) && block.text.includes(imageId)
      );
      if (-1 !== textIndex) {
        console.info(
          `[imageUtils] Found image ID in user text at index ${textIndex}, looking for next adjacent image`
        );
        for (let j = textIndex + 1; j < message.content.length; j++) {
          const block = message.content[j];
          if (isImageContentBlock(block)) {
            const imagePart = block;
            if (imagePart.source && 'data' in imagePart.source && imagePart.source.data) {
              console.info(
                `[imageUtils] Found user-uploaded image for ID ${imageId} at index ${j}`
              );
              return { base64: imagePart.source.data };
            }
          }
          if ('text' === block.type) {
            console.info('[imageUtils] Hit another text block, stopping search');
            break;
          }
        }
      }
    }
  }
  console.info(`[imageUtils] Image not found with ID: ${imageId}`);
}
