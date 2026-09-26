// Highlights the docs section in view and fills the deployed launcher address.
import { CONFIG } from "./config.js";
if (CONFIG.ponsLauncher) {
  document.getElementById("addrLauncher").innerHTML = `<a href="${CONFIG.explorer}/address/${CONFIG.ponsLauncher}" target="_blank" rel="noopener"><code>${CONFIG.ponsLauncher}</code></a>`;
}
const links = [...document.querySelectorAll(".docs-nav a")];
const obs = new IntersectionObserver((entries) => entries.forEach((e) => {
  if (e.isIntersecting) links.forEach((a) => a.classList.toggle("on", a.getAttribute("href") === "#" + e.target.id));
}), { rootMargin: "0px 0px -70% 0px" });
document.querySelectorAll(".prose h2[id]").forEach((h) => obs.observe(h));
