// Portfolio sub-tabs; ?token=0x… pre-fills the coin lookup.
const tabs = document.getElementById("ptabs");
tabs.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-p]");
  if (!b) return;
  tabs.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
  document.getElementById("p-fees").hidden = b.dataset.p !== "fees";
  document.getElementById("p-positions").hidden = b.dataset.p !== "positions";
});
const token = new URLSearchParams(location.search).get("token");
if (token) {
  const input = document.getElementById("lookup");
  input.value = token;
  setTimeout(() => input.dispatchEvent(new Event("change")), 800);
}
