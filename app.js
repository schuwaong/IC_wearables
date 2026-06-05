const header = document.querySelector("[data-site-header]");
const form = document.querySelector("[data-waitlist-form]");
const formStatus = document.querySelector("[data-form-status]");
const progressLinks = [...document.querySelectorAll("[data-nav-section]")];
const sceneSections = [...document.querySelectorAll("[data-scene-section]")];

function updateHeader() {
  if (!header) return;
  header.classList.toggle("is-scrolled", window.scrollY > 24);
}

function setActiveSection(sectionId) {
  progressLinks.forEach((link) => {
    link.classList.toggle("active", link.dataset.navSection === sectionId);
  });
}

function initProgressObserver() {
  if (!progressLinks.length || !sceneSections.length || !("IntersectionObserver" in window)) return;

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible?.target?.id) {
        setActiveSection(visible.target.id);
      }
    },
    {
      rootMargin: "-30% 0px -45% 0px",
      threshold: [0.18, 0.32, 0.48],
    },
  );

  sceneSections.forEach((section) => observer.observe(section));
}

function initWaitlistForm() {
  if (!form || !formStatus) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const email = String(data.get("email") || "").trim();
    const interest = String(data.get("interest") || "demo");

    if (!email) {
      formStatus.textContent = "Add an email to request access.";
      return;
    }

    const label = {
      demo: "retail demo",
      beta: "private beta",
      partnership: "partnership",
    }[interest] || "private beta";

    formStatus.textContent = `Request noted for ${label}.`;
    form.reset();
  });
}

updateHeader();
initProgressObserver();
initWaitlistForm();

window.addEventListener("scroll", updateHeader, { passive: true });
