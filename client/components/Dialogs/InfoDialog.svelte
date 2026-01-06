<script lang="ts">
  import { Button } from '../../lib/components/ui/button/index.js';
  import * as Dialog from '../../lib/components/ui/dialog/index.js';
  import { CONTACT, LIMITS } from '../../../config/constants.js';
  import ExternalLink from '@lucide/svelte/icons/external-link';

  interface Props {
    open: boolean;
  }

  let { open = $bindable() }: Props = $props();

  $effect(() => {
    if (open) {
      // Reset scroll position to top when dialog opens
      // Use setTimeout to ensure DOM is fully rendered
      setTimeout(() => {
        const dialogContent = document.querySelector('[data-slot="dialog-content"]') as HTMLElement;
        if (dialogContent) {
          dialogContent.scrollTop = 0;
        }
      }, 0);
    }
  });
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content class="sm:!max-w-4xl max-h-[80vh] overflow-y-auto">
      <Dialog.Header>
        <Dialog.Title>About yPad <span class="text-xs font-normal text-muted-foreground/50">v{__APP_VERSION__}</span></Dialog.Title>
      </Dialog.Header>

      <div class="space-y-6 py-4">
        <!-- Introduction Section -->
        <section>
          <p class="text-sm text-muted-foreground">
            A real-time collaborative notepad with optional end-to-end encryption. Built out of frustration with the lack of good alternatives. Share notes instantly with custom URLs, password protection, and live editing.
          </p>
        </section>

        <!-- Features Section -->
        <section>
          <h3 class="text-lg font-semibold mb-3">Features</h3>
          <ul class="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
            <li><strong>Real-Time Collaboration:</strong> Multiple users can edit simultaneously with live cursor tracking</li>
            <li><strong>Password Protection:</strong> Optional client-side AES-256 end-to-end encryption</li>
            <li><strong>Custom URLs:</strong> Create memorable links with custom note IDs</li>
            <li><strong>Syntax Highlighting:</strong> Support for 150+ programming languages</li>
            <li><strong>Self-Destructing Notes:</strong> Set view limits or time-based expiration</li>
            <li><strong>Auto-Save:</strong> Your changes are saved automatically as you type</li>
            <li><strong>Dark/Light Theme:</strong> Choose your preferred theme with persistence</li>
          </ul>
        </section>

        <!-- Terms of Service Section -->
        <section>
          <h3 class="text-lg font-semibold mb-3">Terms of Service</h3>
          <div class="space-y-2 text-sm text-muted-foreground">
            <p>
              yPad is provided as a free, personal project for creating and sharing notes. By using this service, you agree to the following terms:
            </p>
            <ul class="list-disc pl-5 space-y-1">
              <li>This service is provided "as is" without any warranties, express or implied.</li>
              <li>The creator makes no guarantees about availability, reliability, or data persistence.</li>
              <li>You are responsible for backing up any important content you create.</li>
              <li>Do not use this service to store sensitive, confidential, or legally protected information.</li>
              <li>Do not use this service for any illegal, harmful, or abusive purposes.</li>
              <li>The creator reserves the right to remove any content or restrict access at any time without notice.</li>
              <li>This is a hobby project with no service level agreements or support guarantees.</li>
            </ul>
          </div>
        </section>

        <!-- Privacy Policy Section -->
        <section>
          <h3 class="text-lg font-semibold mb-3">Privacy Policy</h3>
          <div class="space-y-2 text-sm text-muted-foreground">
            <p>
              Your privacy is important. Here's how yPad handles your data:
            </p>
            <ul class="list-disc pl-5 space-y-1">
              <li><strong>Content Storage:</strong> Notes you create are stored temporarily for the purpose of providing the service.</li>
              <li><strong>Encryption:</strong> You can optionally encrypt your notes client-side. When encrypted, the content is not readable by the server.</li>
              <li><strong>No Account Required:</strong> yPad does not require registration or collect personal information.</li>
              <li><strong>No Tracking:</strong> We do not use analytics, tracking cookies, or third-party advertising.</li>
              <li><strong>IP Addresses:</strong> Server logs may temporarily contain IP addresses for operational purposes.</li>
              <li><strong>Data Retention:</strong> Notes may be automatically deleted based on expiration settings or view limits you configure. Additionally, notes that haven't been accessed in {LIMITS.INACTIVE_NOTE_EXPIRY_DAYS} days are automatically deleted to manage storage.</li>
              <li><strong>No Liability:</strong> The creator is not responsible for any data loss, unauthorized access, or misuse of content.</li>
            </ul>
            <p class="mt-2">
              <strong>Important:</strong> Do not store confidential, sensitive, or personally identifiable information in unencrypted notes.
            </p>
          </div>
        </section>

        <!-- Report Abuse Section -->
        <section>
          <h3 class="text-lg font-semibold mb-3">Report Abuse</h3>
          <div class="space-y-2 text-sm text-muted-foreground">
            <p>
              If you encounter content that violates these terms or is illegal, harmful, or abusive, please report it.
            </p>
            <p>
              Send abuse reports to: <a href="mailto:{CONTACT.ABUSE_EMAIL}" class="text-primary hover:underline font-medium">{CONTACT.ABUSE_EMAIL}</a>
            </p>
            <p>
              Please include the note URL and a brief description of the issue in your report.
            </p>
          </div>
        </section>

        <!-- GitHub Section -->
        <section>
          <h3 class="text-lg font-semibold mb-3">Source Code</h3>
          <div class="space-y-2 text-sm text-muted-foreground">
            <p>
              yPad is open source! You can view the code, report issues, or contribute on GitHub:
            </p>
            <p>
              <a href="https://github.com/yashau/yPad" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline font-medium inline-flex items-center gap-1">
                github.com/yashau/yPad
                <ExternalLink class="w-3 h-3" />
              </a>
            </p>
          </div>
        </section>

        <!-- Creator Section -->
        <section>
          <div class="text-sm text-muted-foreground">
            <p>
              Originally created by <a href="https://yashau.com" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline font-medium inline-flex items-center gap-1">
                Ibrahim Yashau
                <ExternalLink class="w-3 h-3" />
              </a>
            </p>
          </div>
        </section>

        <!-- Disclaimer Section -->
        <section>
          <div class="text-xs text-muted-foreground space-y-1">
            <p>
              <strong>Disclaimer:</strong> yPad is a personal project created and maintained in free time. There is no company, organization, or legal entity behind this service.
            </p>
            <p>
              The creator assumes no liability for any damages, losses, or issues arising from the use of this service. Use at your own risk.
            </p>
          </div>
        </section>
      </div>

      <Dialog.Footer>
        <Button onclick={() => open = false}>Close</Button>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
