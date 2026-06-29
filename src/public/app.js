// ─────────────────────────────────────────────────────────────────────────────
// src/public/app.js — Логіка Single Page Application адмін-панелі
// ─────────────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // ── ЕЛЕМЕНТИ ІНІЦІАЛІЗАЦІЇ ────────────────────────────────────────────────
  const tabs = document.querySelectorAll('.nav-btn');
  const tabViews = document.querySelectorAll('.tab-view');
  const tabTitle = document.getElementById('tab-title');
  const refreshBtn = document.getElementById('refresh-btn');

  // Sub-navigation для редактора текстів
  const subnavBtns = document.querySelectorAll('.subnav-btn');
  const langSections = document.querySelectorAll('.lang-form-section');

  // Модалка розсилок
  const modal = document.getElementById('broadcast-modal');
  const modalTitle = document.getElementById('modal-title');
  const modalSubmitBtn = document.getElementById('modal-submit-btn');
  const newBroadcastBtn = document.getElementById('new-broadcast-btn');
  const closeModalBtn = document.getElementById('close-modal-btn');
  const cancelModalBtn = document.getElementById('cancel-modal-btn');
  const broadcastForm = document.getElementById('broadcast-form');
  const addBtnRowBtn = document.getElementById('add-btn-row-btn');
  const buttonsContainer = document.getElementById('modal-buttons-container');
  const filterTagsList = document.getElementById('filter-tags-list');

  // Форми
  const contentForm = document.getElementById('content-form');
  const configForm = document.getElementById('config-form');

  // Пошук подій
  const eventSearchInput = document.getElementById('event-search');

  // Стан застосунку
  let currentTab = 'dashboard';
  let activityChart = null;
  let allEvents = [];
  let editingBroadcastId = null;
  let currentBroadcasts = [];

  // Toast notifications
  const showToast = (message, type = 'success') => {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast active ${type}`;
    setTimeout(() => {
      toast.classList.remove('active');
    }, 3000);
  };

  // ── НАВІГАЦІЯ ТА ВКЛАДКИ ──────────────────────────────────────────────────
  const switchTab = (tabId) => {
    currentTab = tabId;
    tabs.forEach(btn => {
      if (btn.dataset.tab === tabId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    tabViews.forEach(view => {
      if (view.id === `tab-${tabId}`) {
        view.classList.add('active');
      } else {
        view.classList.remove('active');
      }
    });

    // Назва в шапці
    const titles = {
      dashboard: 'Панель керування та аналітика',
      content: 'Редактор текстів бота',
      settings: 'Налаштування системи',
      broadcasts: 'Керування розсилками'
    };
    tabTitle.textContent = titles[tabId] || 'Адміністрування';

    // Завантаження даних відповідно до вкладки
    loadTabData(tabId);
  };

  tabs.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Перемикання мов у редакторі
  subnavBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      subnavBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const lang = btn.dataset.lang;
      langSections.forEach(sec => {
        if (sec.id === `form-lang-${lang}`) {
          sec.classList.add('active');
        } else {
          sec.classList.remove('active');
        }
      });
    });
  });

  // ── ЗАВАНТАЖЕННЯ ДАНИХ З API ──────────────────────────────────────────────
  const loadTabData = (tabId) => {
    if (tabId === 'dashboard') {
      loadDashboard();
    } else if (tabId === 'content') {
      loadContent();
    } else if (tabId === 'settings') {
      loadSettings();
    } else if (tabId === 'broadcasts') {
      loadBroadcasts();
      loadTags();
    }
  };

  // Оновлення за кліком на кнопку
  refreshBtn.addEventListener('click', () => {
    loadTabData(currentTab);
    showToast('Дані оновлено');
  });

  // ── DASHBOARD & ANALYTICS ─────────────────────────────────────────────────
  const loadDashboard = async () => {
    try {
      const res = await fetch('/api/admin/dashboard');
      if (!res.ok) throw new Error('Помилка сервера при отриманні статистики');
      const data = await res.json();

      // 1. Заповнення карток
      document.getElementById('stat-total-users').textContent = data.stats.totalUsers;
      document.getElementById('stat-new-users').textContent = data.stats.newUsers7d;
      document.getElementById('stat-contacts').textContent = data.stats.withContacts;
      document.getElementById('stat-crm').textContent = data.stats.crmSynced;
      document.getElementById('stat-timezone').textContent = data.stats.withTimezone;

      // 2. Воронка конверсії
      const conv = data.conversion;
      document.getElementById('funnel-start-val').textContent = `${conv.starts} (100%)`;
      
      document.getElementById('funnel-lang-val').textContent = `${conv.langPicks} (${conv.toLang})`;
      document.getElementById('funnel-lang').style.width = conv.toLang;

      document.getElementById('funnel-contacts-val').textContent = `${conv.contacts} (${conv.toContacts})`;
      document.getElementById('funnel-contacts').style.width = conv.toContacts;

      document.getElementById('funnel-clicks-val').textContent = `${conv.urlClicks} (${conv.toClick})`;
      document.getElementById('funnel-clicks').style.width = conv.toClick;

      // 3. Розподіл за мовами
      const langContainer = document.getElementById('lang-distribution');
      langContainer.innerHTML = '';
      if (data.langSplit && data.langSplit.length > 0) {
        data.langSplit.forEach(item => {
          const row = document.createElement('div');
          row.className = 'lang-bar-row';
          const flag = item.language === 'uk' ? '🇺🇦' : item.language === 'ru' ? '🇷🇺' : '🌐';
          row.innerHTML = `
            <span class="lang-name">${flag} ${item.language.toUpperCase()}</span>
            <span class="lang-count">${item._count._all} користувачів</span>
          `;
          langContainer.appendChild(row);
        });
      } else {
        langContainer.innerHTML = '<p class="placeholder-text">Дані відсутні</p>';
      }

      // 4. Побудова графіка Chart.js
      renderActivityChart(data.dailyActivity);

      // 5. Лог подій
      allEvents = data.recentEvents || [];
      renderEvents(allEvents);

    } catch (err) {
      console.error(err);
      showToast(err.message, 'error');
    }
  };

  const renderActivityChart = (dailyActivity) => {
    const ctx = document.getElementById('activity-chart').getContext('2d');
    
    // Руйнуємо попередній графік якщо він був створений
    if (activityChart) {
      activityChart.destroy();
    }

    // Сортуємо по даті (dailyActivity зазвичай йде від нових до старих з SQL)
    const sortedData = [...dailyActivity].reverse();
    
    const labels = sortedData.map(item => {
      const date = new Date(item.day);
      return date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' });
    });
    const values = sortedData.map(item => item.count);

    activityChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Кількість подій бота',
          data: values,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.08)',
          borderWidth: 3,
          fill: true,
          tension: 0.35,
          pointBackgroundColor: '#8b5cf6',
          pointHoverRadius: 7
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.03)' },
            ticks: { color: '#94a3b8' }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.03)' },
            ticks: { color: '#94a3b8', precision: 0 }
          }
        }
      }
    });
  };

  const renderEvents = (events) => {
    const tbody = document.getElementById('events-table-body');
    tbody.innerHTML = '';

    if (events.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center placeholder-text">Жодних подій не знайдено</td></tr>';
      return;
    }

    const BADGES = {
      start: 'badge-start',
      lang_select: 'badge-lang',
      contacts_saved: 'badge-contacts',
      contacts_skipped: 'badge-skipped',
      url_click: 'badge-click',
      btn_gift: 'badge-gift'
    };

    events.forEach(evt => {
      const tr = document.createElement('tr');
      const time = new Date(evt.createdAt).toLocaleString('uk-UA');
      
      const userName = evt.user 
        ? `${evt.user.firstName || ''} ${evt.user.username ? `(@${evt.user.username})` : ''}`
        : `User ID: ${evt.userId}`;

      const badgeClass = BADGES[evt.action] || 'badge-skipped';
      const payloadStr = evt.payload ? JSON.stringify(evt.payload) : '—';

      tr.innerHTML = `
        <td><strong>${userName}</strong></td>
        <td><span class="badge ${badgeClass}">${evt.action}</span></td>
        <td><code>${payloadStr}</code></td>
        <td>${time}</td>
      `;
      tbody.appendChild(tr);
    });
  };

  // Пошук в таблиці подій
  eventSearchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    if (!query) {
      renderEvents(allEvents);
      return;
    }

    const filtered = allEvents.filter(evt => {
      const userMatch = evt.userId.toString().includes(query) || 
        (evt.user && (
          (evt.user.firstName && evt.user.firstName.toLowerCase().includes(query)) ||
          (evt.user.username && evt.user.username.toLowerCase().includes(query))
        ));
      const actionMatch = evt.action.toLowerCase().includes(query);
      const payloadMatch = evt.payload && JSON.stringify(evt.payload).toLowerCase().includes(query);
      
      return userMatch || actionMatch || payloadMatch;
    });

    renderEvents(filtered);
  });

  // ── CONTENT EDITOR ────────────────────────────────────────────────────────
  const loadContent = async () => {
    try {
      const res = await fetch('/api/admin/content');
      if (!res.ok) throw new Error('Помилка сервера при отриманні текстів');
      const data = await res.json();

      // Заповнення UK
      const uk = data.uk || {};
      document.getElementById('uk-video_file_id').value = uk.video_file_id || '';
      document.getElementById('uk-welcome_text').value = uk.welcome_text || '';
      document.getElementById('uk-menu_text').value = uk.menu_text || '';
      document.getElementById('uk-gift_text').value = uk.gift_text || '';
      document.getElementById('uk-btn_register').value = uk.btn_register || '';
      document.getElementById('uk-btn_contacts').value = uk.btn_contacts || '';
      document.getElementById('uk-btn_channel').value = uk.btn_channel || '';
      document.getElementById('uk-btn_consult').value = uk.btn_consult || '';
      document.getElementById('uk-btn_gift').value = uk.btn_gift || '';

      // Заповнення RU
      const ru = data.ru || {};
      document.getElementById('ru-video_file_id').value = ru.video_file_id || '';
      document.getElementById('ru-welcome_text').value = ru.welcome_text || '';
      document.getElementById('ru-menu_text').value = ru.menu_text || '';
      document.getElementById('ru-gift_text').value = ru.gift_text || '';
      document.getElementById('ru-btn_register').value = ru.btn_register || '';
      document.getElementById('ru-btn_contacts').value = ru.btn_contacts || '';
      document.getElementById('ru-btn_channel').value = ru.btn_channel || '';
      document.getElementById('ru-btn_consult').value = ru.btn_consult || '';
      document.getElementById('ru-btn_gift').value = ru.btn_gift || '';

    } catch (err) {
      console.error(err);
      showToast(err.message, 'error');
    }
  };

  contentForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const body = {
      uk: {
        video_file_id: document.getElementById('uk-video_file_id').value,
        welcome_text: document.getElementById('uk-welcome_text').value,
        menu_text: document.getElementById('uk-menu_text').value,
        gift_text: document.getElementById('uk-gift_text').value,
        btn_register: document.getElementById('uk-btn_register').value,
        btn_contacts: document.getElementById('uk-btn_contacts').value,
        btn_channel: document.getElementById('uk-btn_channel').value,
        btn_consult: document.getElementById('uk-btn_consult').value,
        btn_gift: document.getElementById('uk-btn_gift').value,
      },
      ru: {
        video_file_id: document.getElementById('ru-video_file_id').value,
        welcome_text: document.getElementById('ru-welcome_text').value,
        menu_text: document.getElementById('ru-menu_text').value,
        gift_text: document.getElementById('ru-gift_text').value,
        btn_register: document.getElementById('ru-btn_register').value,
        btn_contacts: document.getElementById('ru-btn_contacts').value,
        btn_channel: document.getElementById('ru-btn_channel').value,
        btn_consult: document.getElementById('ru-btn_consult').value,
        btn_gift: document.getElementById('ru-btn_gift').value,
      }
    };

    try {
      const res = await fetch('/api/admin/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) throw new Error('Не вдалося зберегти зміни текстів');
      showToast('Тексти бота успішно оновлено та кеш скинуто');
    } catch (err) {
      console.error(err);
      showToast(err.message, 'error');
    }
  });

  // ── BOT SETTINGS ──────────────────────────────────────────────────────────
  const loadSettings = async () => {
    try {
      const res = await fetch('/api/admin/config');
      if (!res.ok) throw new Error('Помилка сервера при отриманні налаштувань');
      const data = await res.json();

      document.getElementById('cfg-url_site').value = data.url_site || '';
      document.getElementById('cfg-url_channel').value = data.url_channel || '';
      document.getElementById('cfg-url_consult').value = data.url_consult || '';
      document.getElementById('cfg-business_timezone').value = data.business_timezone || 'Europe/Amsterdam';
      document.getElementById('cfg-ask_timezone').value = data.ask_timezone || 'true';

    } catch (err) {
      console.error(err);
      showToast(err.message, 'error');
    }
  };

  configForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const body = {
      url_site: document.getElementById('cfg-url_site').value,
      url_channel: document.getElementById('cfg-url_channel').value,
      url_consult: document.getElementById('cfg-url_consult').value,
      business_timezone: document.getElementById('cfg-business_timezone').value,
      ask_timezone: document.getElementById('cfg-ask_timezone').value,
    };

    try {
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) throw new Error('Не вдалося зберегти налаштування');
      showToast('Глобальні налаштування бота успішно збережено');
    } catch (err) {
      console.error(err);
      showToast(err.message, 'error');
    }
  });

  // ── BROADCASTS MANAGER ────────────────────────────────────────────────────
  const loadBroadcasts = async () => {
    try {
      const res = await fetch('/api/admin/broadcasts');
      if (!res.ok) throw new Error('Помилка сервера при отриманні розсилок');
      const broadcasts = await res.json();
      currentBroadcasts = broadcasts;

      const tbody = document.getElementById('broadcasts-table-body');
      tbody.innerHTML = '';

      if (broadcasts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center placeholder-text">Список розсилок порожній. Створіть нову!</td></tr>';
        return;
      }

      broadcasts.forEach(bc => {
        const tr = document.createElement('tr');
        const time = new Date(bc.createdAt).toLocaleString('uk-UA');
        
        let progress = '—';
        if (bc.status !== 'draft') {
          progress = `${bc.sentCount} / ${bc.totalCount}`;
        }

        // Кнопки дій відповідно до статусу
        let actions = '';
        if (bc.status === 'draft') {
          actions = `
            <button class="primary-btn btn-sm run-broadcast-btn" data-id="${bc.id}">🚀 Запустити</button>
            <button class="secondary-btn btn-sm edit-broadcast-btn" data-id="${bc.id}">✏️ Редагувати</button>
            <button class="secondary-btn btn-sm danger-btn delete-broadcast-btn" data-id="${bc.id}">❌ Видалити</button>
          `;
        } else if (bc.status === 'sending') {
          actions = `<button class="secondary-btn btn-sm danger-btn run-broadcast-btn" data-id="${bc.id}" data-action="cancel">⏹ Зупинити</button>`;
        } else {
          actions = `<button class="secondary-btn btn-sm danger-btn delete-broadcast-btn" data-id="${bc.id}">❌ Видалити</button>`;
        }

        const statusLabel = bc.status === 'draft' ? 'Чернетка' 
          : bc.status === 'sending' ? 'Надсилається' 
          : bc.status === 'cancelled' ? 'Скасовано' 
          : bc.status === 'error' ? 'Помилка' : 'Виконано';

        tr.innerHTML = `
          <td><strong>#${bc.id}</strong></td>
          <td>${bc.title}</td>
          <td><span class="status-badge ${bc.status}">${statusLabel}</span></td>
          <td>${progress}</td>
          <td>${bc.errorCount}</td>
          <td>${time}</td>
          <td>${actions}</td>
        `;
        tbody.appendChild(tr);
      });

      // Реєструємо кліки на кнопки Дій в таблиці
      document.querySelectorAll('.run-broadcast-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = e.target.dataset.id;
          const act = e.target.dataset.action || 'start';

          if (act === 'start') {
            if (!confirm(`Запустити розсилку #${id}? Це надішле повідомлення вашим підписникам.`)) return;
            triggerBroadcastAction(id, 'start');
          } else {
            if (!confirm(`Зупинити активну розсилку #${id}?`)) return;
            triggerBroadcastAction(id, 'cancel');
          }
        });
      });

      // Реєструємо кліки на кнопки редагування
      document.querySelectorAll('.edit-broadcast-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const id = parseInt(e.target.dataset.id, 10);
          const bc = currentBroadcasts.find(item => item.id === id);
          if (!bc) return;

          editingBroadcastId = bc.id;
          modalTitle.textContent = `Редагування розсилки #${bc.id}`;
          modalSubmitBtn.textContent = '💾 Зберегти зміни';

          // Заповнюємо поля
          document.getElementById('bc-title').value = bc.title || '';
          document.getElementById('bc-videoFileId').value = bc.videoFileId || '';
          document.getElementById('bc-text').value = bc.text || '';
          document.getElementById('bc-filterLang').value = bc.filterLang || '';
          document.getElementById('bc-filterHasContacts').checked = !!bc.filterHasContacts;

          // Очищуємо та заповнюємо інлайн кнопки
          buttonsContainer.innerHTML = '';
          if (bc.buttons && Array.isArray(bc.buttons)) {
            bc.buttons.forEach(btnInfo => {
              const row = document.createElement('div');
              row.className = 'btn-row mt-5';
              row.innerHTML = `
                <input type="text" placeholder="Текст кнопки" required class="btn-text-input" value="${btnInfo.text}">
                <input type="url" placeholder="Посилання URL" required class="btn-url-input" value="${btnInfo.url}">
                <button type="button" class="remove-btn-row">&times;</button>
              `;
              buttonsContainer.appendChild(row);
              row.querySelector('.remove-btn-row').addEventListener('click', () => {
                row.remove();
              });
            });
          }

          // Теги
          const tagCheckboxes = filterTagsList.querySelectorAll('input[type="checkbox"]');
          tagCheckboxes.forEach(cb => {
            cb.checked = Array.isArray(bc.filterTags) && bc.filterTags.includes(cb.value);
          });

          modal.classList.add('active');
        });
      });

      // Реєструємо кліки на кнопки видалення
      document.querySelectorAll('.delete-broadcast-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = e.target.dataset.id;
          if (!confirm(`Ви дійсно бажаєте видалити розсилку #${id}?`)) return;

          try {
            const res = await fetch(`/api/admin/broadcasts/${id}`, {
              method: 'DELETE'
            });

            if (!res.ok) {
              const data = await res.json();
              throw new Error(data.error || 'Не вдалося видалити розсилку');
            }

            showToast(`Розсилку #${id} видалено`);
            loadBroadcasts();
          } catch (err) {
            console.error(err);
            showToast(err.message, 'error');
          }
        });
      });

    } catch (err) {
      console.error(err);
      showToast(err.message, 'error');
    }
  };

  const triggerBroadcastAction = async (id, action) => {
    try {
      const res = await fetch(`/api/admin/broadcasts/${id}/${action}`, {
        method: 'POST'
      });

      if (!res.ok) throw new Error(`Не вдалося виконати дію: ${action}`);
      const data = await res.json();
      
      showToast(action === 'start' ? 'Розсилку запущено у фоновому режимі' : 'Запит на зупинку надіслано');
      loadBroadcasts();
    } catch (err) {
      console.error(err);
      showToast(err.message, 'error');
    }
  };

  const loadTags = async () => {
    try {
      const res = await fetch('/api/admin/tags');
      if (!res.ok) throw new Error('Не вдалося завантажити теги');
      const tags = await res.json();

      filterTagsList.innerHTML = '';
      if (tags.length === 0) {
        filterTagsList.innerHTML = '<span class="placeholder-text">Теги в базі відсутні</span>';
        return;
      }

      tags.forEach(tag => {
        const label = document.createElement('label');
        label.className = 'tag-checkbox-label';
        label.innerHTML = `
          <input type="checkbox" name="filterTags" value="${tag}">
          <span>${tag}</span>
        `;
        filterTagsList.appendChild(label);
      });
    } catch (err) {
      console.error(err);
    }
  };

  // ── МОДАЛЬНЕ ВІКНО СТВОРЕННЯ РОЗСИЛКИ ──────────────────────────────────────
  newBroadcastBtn.addEventListener('click', () => {
    editingBroadcastId = null;
    modalTitle.textContent = 'Створення нової розсилки';
    modalSubmitBtn.textContent = '💾 Зберегти як чернетку';
    modal.classList.add('active');
    // Скидаємо поля
    broadcastForm.reset();
    buttonsContainer.innerHTML = '';
  });

  const closeModal = () => {
    modal.classList.remove('active');
  };

  closeModalBtn.addEventListener('click', closeModal);
  cancelModalBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // Конструктор інлайн кнопок для розсилки
  addBtnRowBtn.addEventListener('click', () => {
    const row = document.createElement('div');
    row.className = 'btn-row mt-5';
    row.innerHTML = `
      <input type="text" placeholder="Текст кнопки" required class="btn-text-input">
      <input type="url" placeholder="Посилання URL" required class="btn-url-input">
      <button type="button" class="remove-btn-row">&times;</button>
    `;
    buttonsContainer.appendChild(row);

    // Видалення рядка
    row.querySelector('.remove-btn-row').addEventListener('click', () => {
      row.remove();
    });
  });

  // Сабміт форми розсилки
  broadcastForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Парсимо інлайн кнопки
    const buttons = [];
    const btnRows = buttonsContainer.querySelectorAll('.btn-row');
    btnRows.forEach(row => {
      const text = row.querySelector('.btn-text-input').value;
      const url = row.querySelector('.btn-url-input').value;
      if (text && url) {
        buttons.push({ text, url });
      }
    });

    // Парсимо вибрані теги
    const filterTags = [];
    const tagCheckboxes = filterTagsList.querySelectorAll('input[type="checkbox"]:checked');
    tagCheckboxes.forEach(cb => {
      filterTags.push(cb.value);
    });

    const body = {
      title: document.getElementById('bc-title').value,
      videoFileId: document.getElementById('bc-videoFileId').value || null,
      text: document.getElementById('bc-text').value || null,
      buttons: buttons.length > 0 ? buttons : null,
      filterLang: document.getElementById('bc-filterLang').value || null,
      filterHasContacts: document.getElementById('bc-filterHasContacts').checked,
      filterTags: filterTags
    };

    try {
      const url = editingBroadcastId 
        ? `/api/admin/broadcasts/${editingBroadcastId}` 
        : '/api/admin/broadcasts';
      const method = editingBroadcastId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Не вдалося зберегти зміни розсилки');
      }
      
      showToast(editingBroadcastId ? 'Зміни в розсилці збережено' : 'Чернетку розсилки створено успішно');
      closeModal();
      loadBroadcasts();
    } catch (err) {
      console.error(err);
      showToast(err.message, 'error');
    }
  });

  // ── СТАРТОВИЙ ЗАПУСК ──────────────────────────────────────────────────────
  // За замовчуванням відкриваємо Dashboard
  switchTab('dashboard');
});
