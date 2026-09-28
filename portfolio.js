// Portfolio sub-tabs; ?token=0x… pre-fills the coin lookup.
const tabs = document.getElementById("ptabs");
tabs.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-p]");
  if (!b) return;
  tabs.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
  document.getElementById("p-fees").hidden = b.dataset.p !== "fees";
  document.getElementById("p-positions").hidden = b.dataset.p !== "positions";
  document.getElementById("p-arc").hidden = b.dataset.p !== "arc";
  if (b.dataset.p !== "fees" || location.hash) history.replaceState(null, "", b.dataset.p === "fees" ? location.pathname + location.search : `#${b.dataset.p}`);
  document.dispatchEvent(new CustomEvent("rigs-ptab", { detail: b.dataset.p }));
});
if (location.hash === "#arc") tabs.querySelector('[data-p="arc"]').click();
const token = new URLSearchParams(location.search).get("token");
if (token) {
  const input = document.getElementById("lookup");
  input.value = token;
  setTimeout(() => input.dispatchEvent(new Event("change")), 800);
}
