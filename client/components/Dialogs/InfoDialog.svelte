<script lang="ts">
  import { Button } from '../../lib/components/ui/button/index.js';
  import * as Dialog from '../../lib/components/ui/dialog/index.js';
  import { CONTACT, LIMITS } from '../../../config/constants.js';

  interface Props {
    open: boolean;
  }

  let { open = $bindable() }: Props = $props();
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content class="sm:!max-w-4xl max-h-[80vh] overflow-y-auto">
      <Dialog.Header>
        <Dialog.Title>About yPad</Dialog.Title>
      </Dialog.Header>

      <div class="space-y-6 py-4">
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
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                </svg>
              </a>
            </p>
          </div>
        </section>

        <!-- Disclaimer Section -->
        <section class="pt-4 border-t">
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
