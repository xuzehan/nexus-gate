(() => {
  "use strict";

  const TOKEN_STORAGE_KEY = "nexusgate_access_token";
  const TOAST_DURATION_MS = 3500;

  const form = document.querySelector("#login-form");
  const usernameInput = document.querySelector("#username");
  const passwordInput = document.querySelector("#password");
  const submitButton = document.querySelector("#submit-button");
  const formMessage = document.querySelector("#form-message");
  const toast = document.querySelector("#toast");
  const toastMessage = document.querySelector("#toast-message");
  const passwordToggle = document.querySelector(".password-toggle");

  let toastTimer;

  const apiBaseUrl = String(window.NEXUS_CONFIG?.API_BASE_URL ?? "")
    .trim()
    .replace(/\/+$/, "");

  function showToast(message, type) {
    window.clearTimeout(toastTimer);
    toastMessage.textContent = message;
    toast.classList.toggle("is-error", type === "error");
    toast.classList.remove("is-visible");
    toast.hidden = false;

    window.requestAnimationFrame(() => {
      toast.classList.add("is-visible");
    });

    toastTimer = window.setTimeout(() => {
      toast.classList.remove("is-visible");
      window.setTimeout(() => {
        toast.hidden = true;
      }, 200);
    }, TOAST_DURATION_MS);
  }

  function setLoading(isLoading) {
    submitButton.disabled = isLoading;
    submitButton.classList.toggle("is-loading", isLoading);
  }

  passwordToggle.addEventListener("click", () => {
    const shouldShow = passwordInput.type === "password";
    passwordInput.type = shouldShow ? "text" : "password";
    passwordToggle.textContent = shouldShow ? "隐藏" : "显示";
    passwordToggle.setAttribute("aria-label", shouldShow ? "隐藏密码" : "显示密码");
    passwordToggle.setAttribute("aria-pressed", String(shouldShow));
    passwordInput.focus();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    formMessage.textContent = "";

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    if (!apiBaseUrl || apiBaseUrl.includes("example.com")) {
      formMessage.textContent = "请先在 config.js 中配置后端 API 地址。";
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${apiBaseUrl}/api/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: usernameInput.value.trim(),
          password: passwordInput.value,
        }),
      });

      if (response.status === 401) {
        showToast("账号或密码错误", "error");
        return;
      }

      if (!response.ok) {
        throw new Error(`Login API returned HTTP ${response.status}`);
      }

      const data = await response.json();
      if (typeof data.access_token !== "string" || !data.access_token) {
        throw new Error("Login API response did not contain an access token");
      }

      localStorage.setItem(TOKEN_STORAGE_KEY, data.access_token);
      form.reset();
      showToast("登录成功", "success");
    } catch (error) {
      console.error("Login request failed:", error);
      showToast("登录失败，请稍后重试", "error");
    } finally {
      setLoading(false);
    }
  });
})();
