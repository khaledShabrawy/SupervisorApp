/**
 * WhatsApp Utility Functions
 * Reusable helper to generate standard WhatsApp click-to-chat links and trigger sharing.
 */

/**
 * Generates a direct WhatsApp link with encoded message and optional recipient phone number.
 * Ensures the message is properly URL-encoded to handle Arabic text and special characters.
 *
 * @param phone Recipient phone number (optional)
 * @param message Message text to pre-fill
 * @returns WhatsApp URL (e.g., https://wa.me/2010... or https://wa.me/?text=...)
 */
export function generateWhatsAppLink(phone?: string | null, message: string = ''): string {
  const cleanPhone = phone ? phone.replace(/[^0-9]/g, '') : '';
  const encodedMessage = encodeURIComponent(message);

  if (cleanPhone) {
    return `https://wa.me/${cleanPhone}?text=${encodedMessage}`;
  }
  return `https://wa.me/?text=${encodedMessage}`;
}

/**
 * Shares a message via native share API if supported, or opens WhatsApp directly.
 */
export function triggerWhatsAppShare(phone?: string | null, message: string = ''): void {
  const url = generateWhatsAppLink(phone, message);

  if (typeof navigator !== 'undefined' && navigator.share) {
    navigator.share({ text: message, url }).catch(() => {
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  } else if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
