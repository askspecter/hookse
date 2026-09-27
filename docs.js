// Highlights the docs section in view and fills the deployed launcher address.
import { CONFIG } from "./config.js";
for (const [id, key] of [["addrLauncher", "ponsLauncher"], ["addrHook", "rigsHook"], ["addrV4", "rigsLauncher"], ["addrAuctions", "rigsAuctions"]]) {
  if (CONFIG[key]) document.getElementById(id).innerHTML = `<a href="${CONFIG.explorer}/address/${CONFIG[key]}" target="_blank" rel="noopener"><code>${CONFIG[key]}</code></a>`;
}
const links = [...document.querySelectorAll(".docs-nav a")];
const obs = new IntersectionObserver((entries) => entries.forEach((e) => {
  if (e.isIntersecting) links.forEach((a) => a.classList.toggle("on", a.getAttribute("href") === "#" + e.target.id));
}), { rootMargin: "0px 0px -70% 0px" });
document.querySelectorAll(".prose h2[id]").forEach((h) => obs.observe(h));
