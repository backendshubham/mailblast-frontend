// main.js
const API_URL = "https://mailblast-backend.onrender.com";
let report = [];
let emailChips = [];

document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('resume-upload').addEventListener('click', function() {
    document.getElementById('resume').click();
  });
  document.getElementById('resume').addEventListener('change', function(e) {
    if (e.target.files.length > 0) showFileInfo(e.target.files[0]);
  });
  document.getElementById('emails').addEventListener('input', updateEmailChips);
  document.getElementById('emails').addEventListener('paste', function() {
    setTimeout(updateEmailChips, 10);
  });

  if (localStorage.getItem('smtpEmail') && localStorage.getItem('smtpPass')) {
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('main-form').classList.remove('hidden');
  }
});

function showToast(message, type = 'info', duration = 5000) {
  const toastContainer = document.getElementById('toast-container');
  const toast = document.createElement('div');
  const colors = {
    success: 'bg-green-600 text-white',
    error: 'bg-red-600 text-white',
    warning: 'bg-yellow-500 text-white',
    info: 'bg-accent2 text-white'
  };
  toast.className = `flex items-center rounded-lg shadow-lg px-5 py-3 mb-2 ${colors[type]}`;
  toast.innerHTML = `<span>${message}</span>`;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function showFileInfo(file) {
  if (!file) return;
  document.getElementById('file-name').textContent = file.name;
  document.getElementById('file-size').textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB`;
  document.getElementById('upload-content').classList.add('hidden');
  document.getElementById('file-info').classList.remove('hidden');
}

function removeFile() {
  const fileInput = document.getElementById('resume');
  fileInput.value = '';
  document.getElementById('upload-content').classList.remove('hidden');
  document.getElementById('file-info').classList.add('hidden');
  showToast('File removed', 'info');
}

function updateEmailChips() {
  const emailsRaw = document.getElementById('emails').value;
  const emailChipsContainer = document.getElementById('email-chips');
  const validationInfo = document.getElementById('email-validation');
  emailChipsContainer.innerHTML = '';
  emailChips = [];
  if (!emailsRaw.trim()) {
    validationInfo.classList.add('hidden');
    return;
  }
  const emails = emailsRaw.split(',').map(e => e.trim()).filter(e => e);
  let validCount = 0, invalidCount = 0;
  emails.forEach(email => {
    const isValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
    if (isValid) validCount++; else invalidCount++;
    const chip = document.createElement('span');
    chip.className = `email-chip ${isValid ? '' : 'invalid'}`;
    chip.innerHTML = `
      ${email}
      <span class="remove-chip" onclick="removeEmailChip('${email}')">×</span>
    `;
    emailChipsContainer.appendChild(chip);
    emailChips.push({ email, valid: isValid });
  });
  document.getElementById('valid-count').innerHTML = `<span>✔ ${validCount} valid</span>`;
  document.getElementById('invalid-count').innerHTML = `<span>✖ ${invalidCount} invalid</span>`;
  validationInfo.classList.remove('hidden');
}

function removeEmailChip(emailToRemove) {
  const textarea = document.getElementById('emails');
  const emails = textarea.value.split(',').map(e => e.trim()).filter(e => e && e !== emailToRemove);
  textarea.value = emails.join(', ');
  updateEmailChips();
}

async function login() {
  const email = document.getElementById('smtp-email').value.trim();
  const pass = document.getElementById('smtp-pass').value.trim();
  if (!email || !pass) {
    showToast('Please enter both email and password', 'error');
    return;
  }
  try {
    const res = await fetch(API_URL + '/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ smtpEmail: email, smtpPass: pass })
    });
    const data = await res.json();
    if (data.success) {
      localStorage.setItem('smtpEmail', email);
      localStorage.setItem('smtpPass', pass);
      showToast('SMTP authentication successful!', 'success');
      document.getElementById('login-form').classList.add('hidden');
      document.getElementById('main-form').classList.remove('hidden');
    } else {
      showToast('Authentication failed: ' + (data.error || ''), 'error');
    }
  } catch (err) {
    showToast('Connection error', 'error');
  }
}

function logout() {
  localStorage.removeItem('smtpEmail');
  localStorage.removeItem('smtpPass');
  document.getElementById('main-form').classList.add('hidden');
  document.getElementById('login-form').classList.remove('hidden');
  document.getElementById('login-status').classList.add('hidden');
  document.getElementById('smtp-email').value = "";
  document.getElementById('smtp-pass').value = "";
  showToast('Disconnected from SMTP', 'info');
}

function validateEmails() {
  const validEmails = emailChips.filter(e => e.valid).map(e => e.email);
  if (validEmails.length === 0) {
    showToast('Please enter at least one valid recipient email', 'error');
    return false;
  }
  return validEmails;
}

async function sendMails() {
  const senderEmail = localStorage.getItem('smtpEmail');
  const authPass = localStorage.getItem('smtpPass');
  if (!senderEmail || !authPass) {
    showToast('Not authenticated. Please login again.', 'error');
    logout();
    return;
  }
  const validEmails = validateEmails();
  if (!validEmails) return;
  const message = document.getElementById('message').value.trim();
  const fileInput = document.getElementById('resume');
  const file = fileInput.files[0];
  if (!message) {
    showToast('Message is required', 'error');
    return;
  }
  if (!file) {
    showToast('Please upload a resume', 'error');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast('Resume file too large (max 5MB)', 'error');
    return;
  }

  const sendButton = document.getElementById('send-button');
  sendButton.disabled = true;
  sendButton.innerHTML = '<span class="animate-spin mr-2">⏳</span> Sending...';

  const progressContainer = document.getElementById('progress-container');
  const progressFill = document.getElementById('progress-fill');
  const progressText = document.getElementById('progress-text');
  const mailStatus = document.getElementById('mail-status');
  const statusContent = document.getElementById('status-content');

  progressContainer.classList.remove('hidden');
  mailStatus.classList.remove('hidden');
  statusContent.innerHTML = '';
  report = [];

  const totalEmails = validEmails.length;
  let sentCount = 0;

  for (let i = 0; i < totalEmails; i++) {
    const email = validEmails[i];
    let formData = new FormData();
    formData.append('email', email);
    formData.append('message', message);
    formData.append('resume', file);
    formData.append('smtpEmail', senderEmail);
    formData.append('smtpPass', authPass);

    try {
      const res = await fetch(API_URL + '/send', {
        method: 'POST',
        body: formData
      });

      let statusText, errorMsg = '';
      if (!res.ok) {
        statusText = 'Failed';
        errorMsg = "Server error (" + res.status + ")";
      } else {
        const data = await res.json();
        if (Array.isArray(data.results)) {
          let result = data.results.find(r => r.recipient === email) || {};
          statusText = result.status || 'Failed';
          errorMsg = result.error || '';
          if (statusText === 'Sent') sentCount++;
        } else {
          statusText = data.status && data.status.toLowerCase() === 'sent' ? 'Sent' : 'Failed';
          if (statusText === 'Sent') sentCount++;
          errorMsg = (data.error || '');
        }
      }

      report.push({ email, status: statusText, error: errorMsg });
      const statusItem = document.createElement('div');
      statusItem.className = 'flex items-start';
      if (statusText === 'Sent') {
        statusItem.innerHTML = `<span class="mr-2">✅</span>
          <div><span class="font-medium">Sent to ${email}</span>
          <div class="text-gray-500 text-xs">${new Date().toLocaleTimeString()}</div></div>`;
      } else {
        statusItem.innerHTML = `<span class="mr-2">❌</span>
          <div><span class="font-medium">Failed to ${email}</span>
          <div class="text-gray-500 text-xs">${errorMsg}</div></div>`;
      }
      statusContent.appendChild(statusItem);

      const progress = Math.round(((i + 1) / totalEmails) * 100);
      progressFill.style.width = `${progress}%`;
      progressText.textContent = `${progress}%`;
    } catch (err) {
      report.push({ email, status: "Failed", error: "Network error" });
      const statusItem = document.createElement('div');
      statusItem.className = 'flex items-start';
      statusItem.innerHTML = `<span class="mr-2">❌</span>
        <div><span class="font-medium">Failed to ${email}</span>
        <div class="text-gray-500 text-xs">Network error</div></div>`;
      statusContent.appendChild(statusItem);
    }
  }

  sendButton.disabled = false;
  sendButton.innerHTML = '<span class="mr-2">🚀</span> Send Campaign';
  showToast(`Campaign completed: ${sentCount}/${totalEmails} sent successfully`, sentCount === totalEmails ? 'success' : 'warning');
}

function exportCSV() {
  if (!report || report.length === 0) {
    showToast('No report data to export', 'warning');
    return;
  }
  let csv = "Email,Status,Error\n";
  report.forEach(row => {
    let safeError = (row.error || "").replace(/"/g, '""');
    csv += `"${row.email}","${row.status}","${safeError}"\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `mailblast_report_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast('Report exported successfully', 'success');
}

function clearStatus() {
  document.getElementById('status-content').innerHTML = '';
  document.getElementById('mail-status').classList.add('hidden');
  document.getElementById('progress-container').classList.add('hidden');
}
