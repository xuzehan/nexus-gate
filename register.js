(() => {
  "use strict";

  const COOLDOWN_SECONDS = 60;
  const TOAST_DURATION_MS = 3500;

  const form = document.querySelector("#register-form");
  const usernameInput = document.querySelector("#username");
  const emailInput = document.querySelector("#email");
  const codeInput = document.querySelector("#code");
  const passwordInput = document.querySelector("#password");
  const confirmPasswordInput = document.querySelector("#confirm-password");
  const sendCodeButton = document.querySelector("#send-code-button");
  const registerButton = document.querySelector("#register-button");
  const formMessage = document.querySelector("#form-message");
  const toast = document.querySelector("#toast");
  const toastMessage = document.querySelector("#toast-message");

  const apiBaseUrl = String(window.NEXUS_CONFIG?.API_BASE_URL ?? "")
    .trim()
    .replace(/\/+$/, "");

  let toastTimer;
  let cooldownTimer;
  let redirectTimer;

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

  async function getErrorMessage(response, fallback) {
    try {
      const data = await response.json();
      if (typeof data.detail === "string") {
        return data.detail;
      }
    } catch {
      // The fallback below covers non-JSON proxy and network responses.
    }
    return fallback;
  }

  function ensureApiConfigured() {
    if (!apiBaseUrl || apiBaseUrl.includes("example.com")) {
      formMessage.textContent = "请先在 config.js 中配置后端 API 地址。";
      return false;
    }
    return true;
  }

  function startCooldown() {
    let remaining = COOLDOWN_SECONDS;
    sendCodeButton.disabled = true;

    const updateButton = () => {
      sendCodeButton.textContent = `${remaining} 秒后重发`;
    };

    updateButton();
    cooldownTimer = window.setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        window.clearInterval(cooldownTimer);
        sendCodeButton.disabled = false;
        sendCodeButton.textContent = "重新发送";
        return;
      }
      updateButton();
    }, 1000);
  }

  sendCodeButton.addEventListener("click", async () => {
    formMessage.textContent = "";

    if (!ensureApiConfigured() || !emailInput.checkValidity()) {
      emailInput.reportValidity();
      return;
    }

    sendCodeButton.disabled = true;
    sendCodeButton.textContent = "发送中...";

    try {
      const response = await fetch(`${apiBaseUrl}/api/send-code`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: emailInput.value.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error(
          await getErrorMessage(response, "验证码发送失败，请稍后重试"),
        );
      }

      showToast("验证码已发送，请检查邮箱", "success");
      codeInput.focus();
      startCooldown();
    } catch (error) {
      console.error("Send code request failed:", error);
      sendCodeButton.disabled = false;
      sendCodeButton.textContent = "发送验证码";
      showToast(
        error instanceof Error ? error.message : "验证码发送失败，请稍后重试",
        "error",
      );
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    formMessage.textContent = "";
    window.clearTimeout(redirectTimer);

    if (!ensureApiConfigured() || !form.checkValidity()) {
      form.reportValidity();
      return;
    }

    if (passwordInput.value !== confirmPasswordInput.value) {
      formMessage.textContent = "两次输入的密码不一致";
      confirmPasswordInput.focus();
      return;
    }

    registerButton.disabled = true;
    registerButton.classList.add("is-loading");

    try {
      const response = await fetch(`${apiBaseUrl}/api/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: usernameInput.value.trim(),
          password: passwordInput.value,
          email: emailInput.value.trim(),
          code: codeInput.value.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error(
          await getErrorMessage(response, "注册失败，请稍后重试"),
        );
      }

      registerButton.querySelector(".submit-label").textContent = "注册成功";
      showToast("注册成功，正在返回登录页...", "success");
      redirectTimer = window.setTimeout(() => {
        window.location.href = "./index.html";
      }, 1000);
    } catch (error) {
      console.error("Register request failed:", error);
      registerButton.disabled = false;
      registerButton.classList.remove("is-loading");
      showToast(
        error instanceof Error ? error.message : "注册失败，请稍后重试",
        "error",
      );
    }
  });

  window.addEventListener("beforeunload", () => {
    window.clearInterval(cooldownTimer);
    window.clearTimeout(redirectTimer);
  });
})();
