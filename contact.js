// Contact forms: email CONFIG.contactEmail, or say contact is not set up when it is empty.
import { CONFIG } from "./config.js";

document.querySelectorAll("form[data-contact]").forEach((f) => {
  if (!CONFIG.contactEmail) {
    f.innerHTML = '<p class="dim small">Contact is not set up yet.</p>';
    return;
  }
  f.addEventListener("submit", (e) => {
    e.preventDefault();
    const subject = encodeURIComponent(f.dataset.contact);
    location.href = `mailto:${CONFIG.contactEmail}?subject=${subject}&body=${encodeURIComponent(f.elements.msg.value)}`;
  });
});
