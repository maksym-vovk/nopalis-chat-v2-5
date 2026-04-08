/**
 * Керує progress bar чатбота.
 * Викликається ззовні через chatProgress.setProgress(value).
 */
class ChatBotProgress {
    /**
     * @param {Object} options
     * @param {string|HTMLElement} options.barSelector   - контейнер (#chatProgressBar)
     * @param {string|HTMLElement} options.fillSelector  - заповнювач (#chatProgressFill)
     * @param {string|HTMLElement} [options.labelSelector] - підпис (#chatProgressLabel)
     * @param {string|HTMLElement} [options.currentStepSelector]
     * @param {string|HTMLElement} [options.totalStepsSelector]
     */
    constructor({ barSelector, fillSelector, labelSelector, currentStepSelector, totalStepsSelector } = {}) {
        this.bar   = typeof barSelector  === 'string' ? document.querySelector(barSelector)  : barSelector;
        this.fill  = typeof fillSelector === 'string' ? document.querySelector(fillSelector) : fillSelector;
        this.label = labelSelector
            ? (typeof labelSelector === 'string' ? document.querySelector(labelSelector) : labelSelector)
            : null;
        this.currentStep  = typeof currentStepSelector === 'string' ? document.querySelector(currentStepSelector) : currentStepSelector;
        this.totalSteps  = typeof totalStepsSelector === 'string' ? document.querySelector(totalStepsSelector) : totalStepsSelector;

        this._current = 0;
        this.setSteps(0)

        this.totalStepsValue = this.getTotalStepsValue(PROGRESS_MAP)
    }

    /**
     * Встановлює прогрес (0–100).
     * @param {number} value
     */
    setProgress(value) {
        const clamped = Math.max(0, Math.min(100, value));
        this._current = clamped;

        if (this.fill)  this.fill.style.width = `${clamped}%`;
        if (this.label) this.label.textContent = `${clamped}%`;
    }

    setSteps(currentStepValue = 0) {
        if (this.currentStep) this.currentStep.textContent = String(currentStepValue);
        if (this.totalSteps) this.totalSteps.textContent = String(this.totalStepsValue);
    }

    getTotalStepsValue(steps) {
        const stepsGroupedByPercents = Object.groupBy(steps, ({ value }) => value);
        return Object.values(stepsGroupedByPercents).length;
    }

    reset() {
        this.setProgress(0);
        this.setSteps(0);
    }

    get current() {
        return this._current;
    }
}

/**
 * Простий, але гнучкий чатбот.
 *
 * Ідея:
 * - Вся логіка сценарію описується в масиві steps (data-driven).
 * - ChatBot відповідає лише за:
 *   - рендер повідомлень і кнопок
 *   - анімацію "друкування"
 *   - зберігання простого стану (відповіді користувача)
 * - Будь-які побічні ефекти (аналітика, запити до API) робляться через колбеки.
 */

class ChatBot {
    /**
     * @param {Object} options
     * @param {HTMLElement|string} options.messagesContainer - елемент або селектор для контейнера повідомлень
     * @param {HTMLElement|string} [options.root] - кореневий блок чату (для показу/приховування при потребі)
     * @param {Array} options.steps - сценарій чату
     * @param {number} [options.typingDelay=1200] - затримка "друкування"
     * @param {string} [options.storageKey] - ключ у localStorage для збереження стану (опційно)
     * @param {Function} [options.onAnswer] - (step, answer, state) => void
     * @param {Function} [options.onFinish] - (state) => void
     * @param {Object} [options.avatars] - аватарки
     */
    constructor(options) {
        this.basePath = window.cdn_path ? window.cdn_path : '';

        const defaults = {
            typingDelay: 1200,
            storageKey: null,
            onAnswer: null,
            onFinish: null,
            // readStatusDelay: 250,
            avatars: {
                bot: `${this.basePath}images/chat/cb-ava.png`,
                user: `${this.basePath}images/chat/cb-user.png`,
            },
            //queue
            startQueue: {
                enabled: false,
                delay: 0,
                text: '',
                showTyping: true,
                typingIndicator: 'dots',
            },
        };

        this.config = {
            ...defaults,
            ...options,
            avatars: {
                ...defaults.avatars,
                ...(options?.avatars || {}),
            },
            startQueue: {
                ...defaults.startQueue,
                ...(options?.startQueue || {}),
            },
        };

        this._typingTimeout = null;
        this._typingResolve = null;
        this._queueTimeout = null;
        this._queueResolve = null;
        this._queueInterval = null;
        this._queueCountdownEl = null;
        this._queueEndAt = null;
        this._queueCountdownToken = null;
        this._runToken = 0;
        //end queue
        this._lastUserMessageEl = null;

        // this.config = {...defaults, ...options};

        this.chatPageKey = window.location.pathname.includes('subscribe') ? 'Sub' : 'LP';
        this.userID = localStorage.getItem('userID') || this._generateUserId();
        localStorage.setItem('userID', this.userID);

        this.accessKey = '5ca52aa439738e8b912d83150333c1fc';
        this.secretKey = '129686143e268ff73d6001a8734d3beb';

        this.messagesContainer = this._resolveElement(
            this.config.messagesContainer,
            'messagesContainer'
        );
        this.root = this._resolveElement(this.config.root, null, false);

        this.state = {
            currentStepIndex: 0,
            answers: {},
        };

        // Відновлення стану, якщо потрібне
        if (this.config.storageKey) {
            this._loadState();
        }

        this._isTyping = false;
        this._init();

        // Відправляємо початкові дати тільки при першому відвідуванні
        const analyticsKey = `chatAnalytics_${this.userID}`;
        const existingData = localStorage.getItem(analyticsKey);

        if (!existingData) {
            const now = new Date();
            this._sendDataToSheet({
                userID: this.userID,
                'chat_version': '2.5',
                FirstVisitUA: this._formatKyivDate(now),
                FirstVisitLocalCountry: this._formatLocalDate(now),
                LastAction: this._formatKyivDate(now),
            }).catch(() => {});
        }
    }

    // ---------- Публічні методи ----------

    async start() {
        //queue
        this._cancelPendingAsync();
        // 👉 Повний скид до початкового стану
        // this._isTyping = false;

        // if (this._typingTimeout) {
        //     clearTimeout(this._typingTimeout);
        //     this._typingTimeout = null;
        // }

        // 👉 Спочатку очищаємо чат
        this._clearMessages();
        this._removeInteractiveBlocks();

        // Скидаємо індекс кроку, але зберігаємо clicked_start_chat
        const clickedStartChat = this.state.answers.clicked_start_chat;
        const mainFormName = this.state.answers.main_form_name;
        const mainFormPhone = this.state.answers.main_form_phone;

        this.state = {
            currentStepIndex: 0,
            answers: {
                clicked_start_chat: clickedStartChat || false,
                main_form_name: mainFormName,
                main_form_phone: mainFormPhone,
            },
            everChose2Packs: false
        };

        this._saveState();

        if (this.messagesContainer) {
            this.messagesContainer.scrollTop = 0;
        }

        // Якщо вже проходили частину сценарію — можна показати історію, але тут для простоти починаємо з поточного step
        // this._runCurrentStep();

        //queue
        const runToken = this._runToken;
        const canContinue = await this._runStartQueue(runToken);

        if (!canContinue) {
            return;
        }

        this._runCurrentStep();
    }

    // ---------- Приватні / внутрішні методи ----------

    _init() {
        if (!Array.isArray(this.config.steps) || this.config.steps.length === 0) {
            console.error('[ChatBot] steps is empty or not provided');
            return;
        }

        // if (this.root) {
        //     this.root.classList.remove('hidden');
        // }
    }

    _cancelPendingAsync() {
        this._runToken += 1;
        this._isTyping = false;

        if (this._typingTimeout) {
            clearTimeout(this._typingTimeout);
            this._typingTimeout = null;
        }
        if (this._typingResolve) {
            this._typingResolve(false);
            this._typingResolve = null;
        }

        if (this._queueTimeout) {
            clearTimeout(this._queueTimeout);
            this._queueTimeout = null;
        }
        if (this._queueResolve) {
            this._queueResolve(false);
            this._queueResolve = null;
        }

        if (this._queueInterval) {
            clearInterval(this._queueInterval);
            this._queueInterval = null;
        }

        this._queueCountdownEl = null;
        this._queueEndAt = null;
    }

    _resolveElement(elOrSelector, nameForError = null, required = true) {
        if (!elOrSelector) {
            if (required) {
                throw new Error(`[ChatBot] ${nameForError || 'Element'} is required`);
            }
            return null;
        }

        if (elOrSelector instanceof HTMLElement) return elOrSelector;

        const el = document.querySelector(elOrSelector);
        if (!el && required) {
            throw new Error(
                `[ChatBot] Cannot find element by selector: ${elOrSelector}`
            );
        }
        return el;
    }

    _formatMessageTime(date = new Date()) {
        return new Intl.DateTimeFormat('es-MX', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).format(date);
    }

    _buildStatusMarkup(status = 'sent') {
        return `
         <span class="message-status ${status}" data-message-status="${status}" aria-label="${status}">
            <span class="tick" aria-hidden="true"></span>
            <span class="tick tick--second" aria-hidden="true"></span>
         </span>
        `;
    }

    _setMessageStatus(messageEl, status) {
        if (!messageEl) return;
        const statusEl = messageEl.querySelector('[data-message-status]');
        if (!statusEl) return;

        const rank = { sent: 0, delivered: 1, read: 2 };
        const current = statusEl.getAttribute('data-message-status') || 'sent';

        // Prevent downgrades (e.g. read -> delivered), which cause gray/blue blinking.
        if ((rank[status] ?? -1) < (rank[current] ?? -1)) return;

        statusEl.className = `message-status ${status}`;
        statusEl.setAttribute('data-message-status', status);
        statusEl.setAttribute('aria-label', status);
    }

    _clearMessages() {
        if (!this.messagesContainer) return;
        this.messagesContainer.innerHTML = '';
    }

    _saveState() {
        if (!this.config.storageKey) return;
        try {
            localStorage.setItem(
                this.config.storageKey,
                JSON.stringify(this.state)
            );
        } catch (_) {
            // ігноруємо помилку (наприклад, забитий localStorage)
        }
    }

    _loadState() {
        try {
            const raw = localStorage.getItem(this.config.storageKey);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                this.state = {
                    currentStepIndex: parsed.currentStepIndex ?? 0,
                    answers: parsed.answers ?? {},
                };
            }
        } catch (_) {
            // ігноруємо
        }
    }

    async _runCurrentStep() {
        const step = this.config.steps[this.state.currentStepIndex];
        if (!step) {
            if (typeof this.config.onFinish === 'function') {
                this.config.onFinish({...this.state});
            }
            return;
        }

        // Якщо step має умову пропуску
        if (typeof step.shouldSkip === 'function') {
            const shouldSkip = !!step.shouldSkip({
                step,
                state: this.state,
            });
            if (shouldSkip) {
                this._goToNextStep();
                return;
            }
        }

        // 👉 НОВЕ: хук для побічних ефектів (показати форму, анімацію, скрол тощо)
        if (typeof step.onEnter === 'function') {
            step.onEnter(this, this.state);
        }

        // Показуємо повідомлення бота
        await this._showBotMessages(step);


        // 👉 НОВЕ: якщо крок має форму - показуємо її після повідомлень
        if (step.showForm) {
            this._showDeliveryForm();
            // НЕ переходимо далі - чекаємо submit форми
            return;
        }

        // Обробка options як функції
        let options = step.options;
        if (typeof options === 'function') {
            options = options(this.state);
        }

        // 👉 Перевіряємо обчислену змінну options, а не step.options
        const hasChoices = Array.isArray(options) && options.length > 0;
        const expectsInput = !!step.expectFreeInput;

        if (!hasChoices && !expectsInput) {
            this._goToNextStep();
            return;
        }

        // Рендер кнопок / інпуту
        if (hasChoices) {
            // 👉 Передаємо новий об'єкт з обчисленим масивом options
            this._renderChoices({...step, options});
        }

        if (expectsInput) {
            this._renderInput(step);
        }
    }

    _goToNextStep() {
        this.state.currentStepIndex += 1;
        this._saveState();
        this._runCurrentStep();
    }

    async _showBotMessages(step) {
        const messages = Array.isArray(step.messages)
            ? step.messages
            : [step.message || ''];

        for (let i = 0; i < messages.length; i += 1) {
            const raw = messages[i];

            let baseValue;
            let messageTypingIndicator = null;
            let messageTypingDelay = null;

            if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
                const rawText = raw.text ?? '';
                baseValue = typeof rawText === 'function' ? rawText(this.state) : rawText;
                messageTypingIndicator = raw.typingIndicator || null;
                messageTypingDelay = typeof raw.typingDelay === 'number' ? raw.typingDelay : null;
            } else {
                baseValue = typeof raw === 'function' ? raw(this.state) : raw;
            }

            // If a message function returns an array, send each item as its own bubble.
            const messageParts = Array.isArray(baseValue) ? baseValue : [baseValue];

            for (let partIndex = 0; partIndex < messageParts.length; partIndex += 1) {
                const part = messageParts[partIndex];
                // const msg = typeof part === 'function' ? part(this.state) : part;

                let msg, partTypingIndicator, partTypingDelay;

                if (part && typeof part === 'object' && !Array.isArray(part)) {
                    const partText = part.text ?? part.html ?? '';
                    msg = typeof partText === 'function' ? partText(this.state) : partText;
                    partTypingIndicator = part.typingIndicator ?? messageTypingIndicator;
                    partTypingDelay = typeof part.typingDelay === 'number'
                        ? part.typingDelay
                        : (messageTypingDelay ?? this._calcTypingDelay(msg));
                } else {
                    msg = typeof part === 'function' ? part(this.state) : part;
                    partTypingIndicator = messageTypingIndicator;
                    partTypingDelay = messageTypingDelay ?? this._calcTypingDelay(String(msg) ?? '');
                }

                const delay =
                    messageTypingDelay !== null
                        ? messageTypingDelay
                        : typeof step.typingDelay === 'number'
                            ? step.typingDelay
                            : this._calcTypingDelay(msg);

                const indicatorType =
                    messageTypingIndicator ||
                    step.typingIndicator ||
                    this.config.typingIndicator ||
                    'dots';

                // Mark as delivered immediately
                this._setMessageStatus(this._lastUserMessageEl, 'delivered');

                // Schedule mark as read DURING typing delay (use typingDelayMin)
                const readDelay = this.config.typingDelayMin / 2 || 600;
                const readTimeout = setTimeout(() => {
                    this._setMessageStatus(this._lastUserMessageEl, 'read');
                }, readDelay);

                // Show typing
                await this._showTyping(partTypingDelay, indicatorType);

                // Clear timeout if still pending (in case typing finished before read delay)
                clearTimeout(readTimeout);

                // Ensure it's marked as read after typing
                this._setMessageStatus(this._lastUserMessageEl, 'read');

                this._addMessage({
                    from: 'bot',
                    text: part?.html ? undefined : msg,
                    html: part?.html ? msg : step.html,
                    stepId: i === 0 && partIndex === 0 ? step.id : null,
                });
            }
        }
    }

    /**
     * Calculates a typing delay based on message text length.
     * Strips HTML tags before counting characters.
     * Falls back to global typingDelay if no length-based config is set.
     *
     * @param {string} text
     * @returns {number} delay in ms
     */
    _calcTypingDelay(text) {
        const plain = String(text ?? '').replace(/<[^>]*>/g, ''); // strip HTML
        const len = plain.length;

        const msPerChar = typeof this.config.typingDelayPerChar === 'number'
            ? this.config.typingDelayPerChar
            : 15;   // 15ms per character by default

        const min = typeof this.config.typingDelayMin === 'number'
            ? this.config.typingDelayMin
            : 600;  // minimum 600ms

        const max = typeof this.config.typingDelayMax === 'number'
            ? this.config.typingDelayMax
            : 3000; // maximum 3000ms

        return Math.min(max, Math.max(min, len * msPerChar));
    }

    _showTyping(delay, indicatorType) {
        if (!this.messagesContainer || delay <= 0) {
            return Promise.resolve();
        }

        this._isTyping = true;

        const typingEl = document.createElement('div');
        // Як в оригінальному chat-bot.js: "message received" + typing-indicator
        typingEl.className = 'message received';

        const indicatorMarkup =
            indicatorType === 'mic'
                ? `
              <div class="typing-indicator">
                <div class="typing-mic"></div>
              </div>
            `
                : `
              <div class="typing-indicator">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
              </div>
            `;

        typingEl.innerHTML = `
<!--          <img src="${this.config.avatars.bot}" alt="Consultor" class="message-avatar">-->
          ${indicatorMarkup}
        `;

        // typingEl.innerHTML = `
        //   <img src="${this.config.avatars.bot}" alt="Consultor" class="message-avatar">
        //   <div class="typing-indicator">
        //     <div class="typing-dot"></div>
        //     <div class="typing-dot"></div>
        //     <div class="typing-dot"></div>
        //   </div>
        // `;

        // typingEl.innerHTML = `
        //   <img src="${this.config.avatars.bot}" alt="Consultor" class="message-avatar">
        //   <div class="typing-indicator">
        //     <div class="typing-mic"></div>
        //   </div>
        // `;

        this.messagesContainer.appendChild(typingEl);
        this._scrollToBottom();

        // return new Promise(resolve => {
        //     this._typingTimeout = setTimeout(() => {
        //         typingEl.remove();
        //         this._isTyping = false;
        //         this._typingTimeout = null;
        //         resolve();
        //     }, delay);
        // });

        //queue
        return new Promise(resolve => {
            this._typingResolve = resolve;

            this._typingTimeout = setTimeout(() => {
                typingEl.remove();
                this._isTyping = false;
                this._typingTimeout = null;

                const done = this._typingResolve;
                this._typingResolve = null;
                done?.(true);
            }, delay);
        });
    }
    // queue
    _wait(delay, runToken = this._runToken) {
        return new Promise(resolve => {
            this._queueResolve = resolve;

            this._queueTimeout = setTimeout(() => {
                this._queueTimeout = null;

                const done = this._queueResolve;
                this._queueResolve = null;

                if (runToken !== this._runToken) {
                    done?.(false);
                    return;
                }

                done?.(true);
            }, delay);
        });
    }
    // queue
    async _runStartQueue(runToken = this._runToken) {
        const queue = this.config.startQueue;

        if (!queue?.enabled) {
            return true;
        }

        const delay =
            typeof queue.delay === 'function'
                ? Number(queue.delay(this.state)) || 0
                : Number(queue.delay) || 0;

        let queueMessageEl = null;

        if (queue.text || queue.showCountdown) {
            queueMessageEl = this._addMessage({
                from: 'bot',
                html: `
                <div class="chat-queue-card">
                    ${queue.text || ''}
                    ${queue.showCountdown ? `
                        <div class="chat-queue-timer">
                            ${queue.countdownLabel || 'Remaining time:'}
                            <span data-queue-remaining></span>
                        </div>
                    ` : ''}
                </div>
            `,
            });
        }

        if (queue.showCountdown && queueMessageEl) {
            this._startQueueCountdown(delay, queueMessageEl, runToken);
        }

        try {
            if (delay <= 0) {
                return runToken === this._runToken;
            }

            if (queue.showTyping) {
                await this._showTyping(delay, queue.typingIndicator || 'dots');
                return runToken === this._runToken;
            }

            return await this._wait(delay, runToken);
        } finally {
            this._stopQueueCountdown(runToken);
            queueMessageEl?.remove();
        }
    }

    _formatText(text) {
        // Повторюємо formatMessage з оригіналу: \n -> <br>
        return String(text ?? '').replace(/\n/g, '<br>');
    }

    _addMessage({from, text, html, stepId, sentAt = Date.now(), status = 'sent'}) {
        if (!this.messagesContainer) return;

        const isUser = from === 'user';
        const typeClass = isUser ? 'sent' : 'received';

        const messageElement = document.createElement('div');
        messageElement.classList.add("message", typeClass);

        if (stepId === "effect_audio") {
            messageElement.classList.add("message--audio");
        }

        if (stepId) {
            const isIdExist = document.getElementById(`question-${stepId}`);
            if (!isIdExist) messageElement.id = `question-${stepId}`;
        }

        const avatarSrc = isUser
            ? this.config.avatars.user
            : this.config.avatars.bot;

        const content = html || this._formatText(text);
        const timeLabel = this._formatMessageTime(new Date(sentAt));

        messageElement.innerHTML = `
<!--          <img src="${avatarSrc}" alt="Avatar" class="message-avatar">-->
          <div class="message-content">
            <div class="message-text">${content}</div>
            <div class="message-meta">
              <span class="message-time">${timeLabel}</span>
              ${isUser ? this._buildStatusMarkup(status) : ''}
            </div>
          </div>
        `;

        this.messagesContainer.appendChild(messageElement);
        // Init any audio players rendered inside this new message bubble.
        messageElement.querySelectorAll('.audio-player').forEach((player) => {
            if (player.dataset.audioInit === '1') return;
            setupAudioPlayer(player);
            player.dataset.audioInit = '1';
        });
        this._scrollToBottom();

        if (isUser) {
            this._lastUserMessageEl = messageElement;
        }

        return messageElement;
    }

    _formatQueueRemaining(ms) {
        const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;

        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    _stopQueueCountdown(ownerToken = null) {
        if (
            ownerToken !== null &&
            this._queueCountdownToken !== null &&
            ownerToken !== this._queueCountdownToken
        ) {
            return;
        }

        if (this._queueInterval) {
            clearInterval(this._queueInterval);
            this._queueInterval = null;
        }

        this._queueCountdownEl = null;
        this._queueEndAt = null;
        this._queueCountdownToken = null;
    }

    _startQueueCountdown(delay, messageElement, ownerToken = this._runToken) {
        const countdownEl = messageElement?.querySelector('[data-queue-remaining]');
        if (!countdownEl || delay <= 0) return;

        this._queueCountdownEl = countdownEl;
        this._queueEndAt = Date.now() + delay;
        this._queueCountdownToken = ownerToken;

        const updateCountdown = () => {
            if (!this._queueCountdownEl || this._queueEndAt === null) return;

            const remaining = Math.max(0, this._queueEndAt - Date.now());
            this._queueCountdownEl.textContent = this._formatQueueRemaining(remaining);

            if (remaining <= 0) {
                this._stopQueueCountdown(ownerToken);
            }
        };

        updateCountdown();
        this._queueInterval = setInterval(updateCountdown, 250);
    }

    _scrollToBottom() {
        if (!this.messagesContainer) return;
        requestAnimationFrame(() => {
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        });
    }

    _removeInteractiveBlocks() {
        // Прибираємо і наші інпути, і блоки з кнопками як в оригіналі
        const oldInteractive = this.messagesContainer.querySelectorAll(
            '.message-choices, .message-input-block, .message-buttons'
        );
        oldInteractive.forEach(el => el.remove());
    }

    _renderChoices(step) {
        this._removeInteractiveBlocks();

        const container = document.createElement('div');
        container.className = 'message-buttons';


        step.options.forEach((option, index) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'message-button';
            btn.textContent = option.label;

            // 👉 Додаємо унікальний ID для кожної кнопки
            btn.id = `chat-btn-${step.id}-${option.value || index}`;

            // 👉 Додаємо data-атрибути для зручності трекінгу
            btn.dataset.stepId = step.id;
            btn.dataset.optionValue = option.value || option.label;

            if (option.color) {
                btn.style.background = option.color;
            }

            // const isIntroBack = step.id === 'intro' && option.value === 'back';

            const isIntroBack =
                (step.id === 'intro' || step.id === 'intro_after_data') &&
                option.value === 'back';

            if (isIntroBack) {
                btn.addEventListener('click', e => {
                    e.preventDefault();

                    const callTimeModal = document.getElementById('callTimeModal');
                    const endModal = document.getElementById('endConsultationModal');

                    if (this._shouldShowCallTimeModal()) {
                        if (callTimeModal) {
                            callTimeModal.classList.add('active');
                        }
                    } else {
                        if (endModal) {
                            endModal.classList.add('active');
                            setBodyScrollLock(true);
                        }
                    }
                });
            } else {
                btn.addEventListener('click', () => {
                    this._removeInteractiveBlocks();
                    this._handleChoice(step, option);
                });
            }

            container.appendChild(btn);
        });

        this.messagesContainer.appendChild(container);
        this._scrollToBottom();
    }

    _renderInput(step) {
        // Наш кастомний блок для текстового вводу — верстка може бути будь-яка
        this._removeInteractiveBlocks();

        const block = document.createElement('div');
        block.className = 'message-input-block';

        // Обчислюємо placeholder (може бути функцією або рядком)
        const placeholderValue =
            typeof step.inputPlaceholder === 'function'
                ? step.inputPlaceholder(this.state)
                : step.inputPlaceholder || 'Introduceți răspunsul...';

        // Перевіряємо localStorage для автозаповнення
        let defaultValue = '';
        if (step.id === 'full_name' || step.id === 'main_form_name') {
            defaultValue = localStorage.getItem('chatFormName') || JSON.parse(localStorage.getItem(`chatAnalytics_${this.userID}`))['main_form_name'] || '';
        } else if (step.id === 'contact_phone' || step.id === 'main_form_phone') {
            defaultValue = localStorage.getItem('chatFormPhone') || JSON.parse(localStorage.getItem(`chatAnalytics_${this.userID}`))['main_form_phone'] || '';
        } else if (step.id === 'whatsapp_phone') {
            defaultValue = '';
        }

        block.innerHTML = `
          <input
            type="${step.id === 'contact_phone' || step.id === 'whatsapp_phone' ? 'tel' : 'text'}"
            class="message-input-field"
            placeholder="${placeholderValue}"
            ${step.id === 'contact_phone' || step.id === 'whatsapp_phone' ? 'inputmode="tel"' : ''}
            value="${defaultValue}"
          />
          <button 
            type="button" 
            class="message-input-send form-button"
            id="chat-btn-${step.id}-send"
            data-step-id="${step.id}">
            ${step.inputButtonLabel || '<svg width="24" height="24" fill="none"><path fill="white" d="M5.4 19.425a.99.99 0 0 1-.95-.088Q4 19.051 4 18.5V14l8-2-8-2V5.5q0-.55.45-.838a.99.99 0 0 1 .95-.087l15.4 6.5q.625.275.625.925t-.625.925z"/></svg>'}
          </button>
        `;

        const input = block.querySelector('.message-input-field');
        const phoneStepIds = ['contact_phone', 'main_form_phone', 'whatsapp_phone'];
        if (phoneStepIds.includes(step.id)) {
            input.setAttribute('inputmode', 'numeric');
            input.setAttribute('type', 'tel');
            input.addEventListener('input', (e) => {
                e.target.value = e.target.value.replace(/\D/g, '');
            });
        }

        const sendBtn = block.querySelector('.message-input-send');

        const send = () => {
            const value = (input.value || '').trim();
            if (!value) return;

            // 👉 Явно зберігаємо в localStorage перед відправкою
            if (step.id === 'full_name' || step.id === 'main_form_name') {
                localStorage.setItem('chatFormName', value);
            } else if (step.id === 'contact_phone' || step.id === 'main_form_phone') {
                localStorage.setItem('chatFormPhone', value);
            }

            this._handleInputAnswer(step, value);
        };

        sendBtn.addEventListener('click', send);
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                send();
            }
        });

        input.addEventListener('blur', () => {
            const value = (input.value || '').trim();
            if (!value || !step.id) return;

            const prev = this.state.answers[step.id];
            if (prev === value) return; // avoid duplicate analytics

            // Save to state and analytics (fire-and-forget)
            this.state.answers[step.id] = value;
            this._saveState();
            this._sendStepAnalytics(step.id, value);

            // Зберігаємо в localStorage для всіх варіантів імені та телефону
            if (step.id === 'full_name' || step.id === 'main_form_name') {
                localStorage.setItem('chatFormName', value);
            } else if (step.id === 'contact_phone' || step.id === 'main_form_phone') {
                localStorage.setItem('chatFormPhone', value);
            }
        });

        this.messagesContainer.appendChild(block);
        input.focus();

        // Якщо є значення за замовчуванням, виділяємо його для зручності редагування
        if (defaultValue) {
            input.setSelectionRange(0, defaultValue.length);
        }

        this._scrollToBottom();
    }

    _showProductAnimation(quantity) {
        if (!this.messagesContainer) return;

        // Обгортаємо в структуру повідомлення з аватаром
        const messageWrapper = document.createElement('div');
        messageWrapper.className = 'message received';

        const animationContainer = document.createElement('div');
        animationContainer.className = 'product-selection';

        // Заголовок
        const title = document.createElement('h4');
        title.textContent = `Programul dvs.: ${quantity} pachete`;
        title.style.cssText =
            'margin-top: 0; margin-bottom: 16px; color: #1f2937; font-size: 16px; font-weight: 600;';

        // Контейнер з анімацією товарів
        const productContainer = document.createElement('div');
        productContainer.className = 'product-animation';

        // Створюємо елементи продуктів (накладаються один на одного)
        for (let i = 0; i < quantity; i++) {
            const productItem = document.createElement('div');
            productItem.className = 'product-item';
            productItem.style.marginLeft = i > 0 ? '-70px' : '0';
            productContainer.appendChild(productItem);
        }

        animationContainer.appendChild(title);
        animationContainer.appendChild(productContainer);

        // Додаємо аватар і контент як у звичайних повідомлень
        messageWrapper.innerHTML = `
<!--        <img src="${this.config.avatars.bot}" alt="Consultor" class="message-avatar">-->
        <div class="message-content">
        </div>
    `;

        const messageContent = messageWrapper.querySelector('.message-content');
        messageContent.appendChild(animationContainer);

        this.messagesContainer.appendChild(messageWrapper);
        this._scrollToBottom();
    }

    initProfile() {
        const headerProfileInfo = document.querySelector('.header-info')
        const profile = document.querySelector('.info-panel')
        const closeProfileBtn = document.querySelector('#closeProfileBtn')
        const backToChat = document.querySelector('#detailsBtn')

        headerProfileInfo.addEventListener('click', () => this.openProfile(profile))
        closeProfileBtn.addEventListener('click', () => this.closeProfile(profile))
        backToChat.addEventListener('click', () => this.closeProfile(profile))
    }

    openProfile(profile) {
        profile.classList.add('active')
    }

    closeProfile(profile) {
        profile.classList.remove('active')
    }

    initInfoPanel() {
        // const infoBtn = document.getElementById('infoBtn');
        // const infoPanel = document.getElementById('infoPanel');
        // const infoPanelClose = document.querySelector('.info-panel-close');
        // const chatHeader = document.querySelector('.chat-header');
        // let isInfoPanelOpen = false;
        //
        // if (!infoBtn || !infoPanel || !infoPanelClose || !chatHeader) return;
        //
        // infoBtn.addEventListener('click', e => {
        //     e.preventDefault();
        //     e.stopPropagation();
        //
        //     if (isInfoPanelOpen) {
        //         this.closeInfoPanel();
        //         isInfoPanelOpen = false;
        //     } else {
        //         this.openInfoPanel();
        //         isInfoPanelOpen = true;
        //     }
        // });
        //
        // infoPanelClose.addEventListener('click', () => {
        //     if (isInfoPanelOpen) {
        //         this.closeInfoPanel();
        //         isInfoPanelOpen = false;
        //     }
        // });
        //
        // document.addEventListener('keydown', e => {
        //     if (e.key === 'Escape' && isInfoPanelOpen) {
        //         this.closeInfoPanel();
        //         isInfoPanelOpen = false;
        //     }
        // });
        //
        // document.addEventListener('click', e => {
        //     if (isInfoPanelOpen && !infoPanel.contains(e.target)) {
        //         this.closeInfoPanel();
        //         isInfoPanelOpen = false;
        //     }
        // });
        //
        // infoPanel.addEventListener('click', e => {
        //     e.stopPropagation();
        // });
    }

    // openInfoPanel() {
    //     const infoPanel = document.getElementById('infoPanel');
    //     const infoBtn = document.getElementById('infoBtn');
    //     const chatHeader = document.querySelector('.chat-header');
    //
    //     if (!infoPanel || !infoBtn || !chatHeader || !this.messagesContainer) return;
    //
    //     this.messagesContainer.classList.add('hidden');
    //     infoPanel.classList.add('active');
    //     infoBtn.style.transform = 'rotate(180deg)';
    //     infoBtn.style.transition = 'transform 0.3s ease';
    //     chatHeader.style.minHeight = '400px';
    // }
    //
    // closeInfoPanel() {
    //     const infoPanel = document.getElementById('infoPanel');
    //     const infoBtn = document.getElementById('infoBtn');
    //     const chatHeader = document.querySelector('.chat-header');
    //
    //     if (!infoPanel || !infoBtn || !chatHeader || !this.messagesContainer) return;
    //
    //     this.messagesContainer.classList.remove('hidden');
    //     infoPanel.classList.remove('active');
    //     infoBtn.style.transform = 'rotate(0deg)';
    //     chatHeader.style.minHeight = 'auto';
    // }

    _shouldShowCallTimeModal() {
        return (
            this.state.answers.contact_phone ||
            this.state.answers.main_form_phone ||
            this.state.answers.whatsapp_phone
        );
    }

    initClose() {
        const closeBtn = this.root.querySelector('#closeBtn');
        const endModal = document.getElementById('endConsultationModal');
        const callTimeModal = document.getElementById('callTimeModal');
        const modalConfirmBtn = endModal?.querySelector('#confirmEnd');
        const modalCancelBtn = endModal?.querySelector('.cancel-btn');
        const offerForm = document.querySelector('.offer__form');

        // Submit call time
        const submitCallTimeBtn = document.getElementById('submitCallTime');

        submitCallTimeBtn?.addEventListener('click', async () => {
            const select = document.getElementById('callTimeSelect');
            const selectedTime = select?.value;
            const controlButtons = callTimeModal?.querySelector('.modal-content-call__controls');

            // Visual + functional disable
            submitCallTimeBtn.disabled = true;
            submitCallTimeBtn.style.opacity = '0.6';
            submitCallTimeBtn.style.cursor = 'not-allowed';
            submitCallTimeBtn.textContent = submitCallTimeBtn.dataset.process;

            try {
                await this._sendDataToSheet({
                    userID: this.userID,
                    LastAction: this._formatKyivDate(),
                    preferred_call_time: normalizeTime(selectedTime),
                });
            } catch (e) {
                console.error(e);
            }

            delete this.state.answers.main_form_name;
            delete this.state.answers.main_form_phone;
            this._saveState();

            // Restore button before showing success
            submitCallTimeBtn.disabled = false;
            submitCallTimeBtn.style.opacity = '';
            submitCallTimeBtn.style.cursor = '';
            submitCallTimeBtn.textContent = submitCallTimeBtn.dataset.text;

            // Show success state
            if (controlButtons) controlButtons.style.display = 'none';
            const thankYouMsg = document.getElementById('thankYouMessage');
            thankYouMsg?.classList.remove('hidden');

            await new Promise(resolve => setTimeout(resolve, 3000));

            // Close and reset
            callTimeModal.classList.remove('active');
            setBodyScrollLock(false);
            if (controlButtons) controlButtons.style.display = '';
            thankYouMsg?.classList.add('hidden');
            this.root.classList.add('hidden');
            document.querySelector('.offer__form')?.classList.add('hidden');

            resetChatAudio();
        });


        const backFromCallTimeBtn = callTimeModal?.querySelector('.back-from-call-time-btn');
        if (backFromCallTimeBtn) {
            backFromCallTimeBtn.addEventListener('click', () => {
                // Просто закриваємо модалку, повертаємося до чату
                callTimeModal.classList.remove('active');
                syncBodyScrollLockWithChat();
            });
        }
        const closeCallTimeBtn = callTimeModal?.querySelector('.close-call-time-btn');
        if (closeCallTimeBtn) {
            closeCallTimeBtn.addEventListener('click', () => {
                // Відправляємо дані
                this._sendDataToSheet({
                    userID: this.userID,
                    LastAction: this._formatKyivDate(),
                    call_refused: true,
                }).catch(() => {});

                callTimeModal.classList.remove('active');
                this.root.classList.add('hidden');
                if (offerForm) offerForm.classList.add('hidden');
                setBodyScrollLock(false);
                resetChatAudio()
            })
        }

        if (!closeBtn) return;

        closeBtn.addEventListener('click', () => {
            // Перевіряємо умови для модалки з часом дзвінка
            if (this._shouldShowCallTimeModal()) {
                // Показуємо модалку з вибором часу
                if (callTimeModal) {
                    callTimeModal.classList.add('active');
                }
            } else {
                // Показуємо стандартну модалку підтвердження
                if (endModal) {
                    endModal.classList.add('active');
                }
            }
        });

        // Стандартна модалка
        if (modalConfirmBtn) {
            modalConfirmBtn.addEventListener('click', () => {
                this._cancelPendingAsync();
                this._clearMessages();

                this.root.classList.add('hidden');
                if (offerForm) offerForm.classList.add('hidden');
                setBodyScrollLock(false);
                if (endModal) {
                    endModal.classList.remove('active');
                }
            });
        }

        if (modalCancelBtn) {
            modalCancelBtn.addEventListener('click', () => {
                if (endModal) {
                    endModal.classList.remove('active');
                }
            });
        }

        // Close modals by overlay click
        callTimeModal?.addEventListener('click', function(e) {
            if (e.target === this) {
                this.classList.remove('active');
                syncBodyScrollLockWithChat();
            }
        });

        endModal?.addEventListener('click', function(e) {
            if (e.target === this) {
                this.classList.remove('active');
            }
        });
    }

    initModal() {
        const modal = document.getElementById('imageModal');
        const modalClose = document.getElementById('modalClose');
        const modalImage = document.getElementById('modalImage');

        if (!modal || !modalClose || !modalImage) return;

        modalClose.addEventListener('click', () => {
            this.closeModal();
        });

        modal.addEventListener('click', e => {
            if (e.target === modal) {
                this.closeModal();
            }
        });

        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                this.closeModal();
            }
        });
    }

    openModal(imageSrc, imageAlt = '') {
        const modal = document.getElementById('imageModal');
        const modalImage = document.getElementById('modalImage');

        if (!modal || !modalImage) return;

        modalImage.src = imageSrc;
        modalImage.alt = imageAlt || '';

        modal.classList.add('active');
        setBodyScrollLock(true);
    }

    closeModal() {
        const modal = document.getElementById('imageModal');
        if (!modal) return;

        modal.classList.remove('active');
        syncBodyScrollLockWithChat();
    }

    makeImageClickable(imageElement) {
        if (!imageElement) return;
        imageElement.classList.add('clickable-image');
        imageElement.addEventListener('click', () => {
            this.openModal(imageElement.src, imageElement.alt);
        });
    }

    _handleChoice(step, option) {
        // 1. показуємо відповідь користувача
        this._addMessage({from: 'user', text: option.label});

        // 2. зберігаємо її в state
        if (step.id) {
            this.state.answers[step.id] = option.value ?? option.label;
            // 👉 відправляємо в таблицю
            // this._sendStepAnalytics(step.id, option.value ?? option.label);

            // 👉 Розраховуємо ціну для курсу ***
            let price = null;
            let chose2Packs = null;

            if (step.id === 'course_choice' ||
                step.id === 'two_packs_price' ||
                step.id === 'two_packs_upsell') {
                const packs = option.value;
                console.log(packs);
                // const priceMap = {
                //     2: 1380,
                //     3: 1480,
                //     5: 1880,
                //     6: 2450,
                // };
                const priceMap = {
                    2: 368,
                    4: 646,
                    5: 558
                };
                price = priceMap[packs] || null;

                // 👉 Якщо обрав 2 упаковки - встановлюємо прапорець назавжди
                if (packs === 2) {
                    this.state.everChose2Packs = true;
                }

                // Відправляємо поточний стан прапорця
                chose2Packs = this.state.everChose2Packs || false;
            }

            // 👉 Відправляємо важливі кроки в Google Sheets ***
            // const importantSteps = ['age', 'weight', 'goal', 'course_choice', 'involvement', 'delivery_phone_type'];
            const importantSteps = ['age', 'weight', 'goal', 'course_choice', 'delivery_phone_type'];
            const updatePriceSteps = ['two_packs_price', 'two_packs_upsell']

            if (importantSteps.includes(step.id)) {
                const data = {
                    userID: this.userID,
                    LastAction: this._formatKyivDate(),
                    [step.id]: option.name ?? option.value ?? option.label,
                    // [step.id]: option.value ?? option.label,
                };

                // Додаємо ціну якщо є
                if (price !== null) {
                    data.price = price;
                }

                // 👉 Додаємо інформацію про вибір 2 упаковок
                if (chose2Packs !== null) {
                    data.chose_2_packs = chose2Packs;
                }

                this._sendDataToSheet(data).catch(() => {
                });
            }
            // 👉 Для upsell-кроків — оновлюємо тільки ціну, без зайвих колонок
            if (updatePriceSteps.includes(step.id)) {
                if (price !== null) {
                    const data = {
                        userID: this.userID,
                        LastAction: this._formatKyivDate(),
                        price: price,
                        course_choice: option.value,
                    };
                    if (chose2Packs !== null) {
                        data.chose_2_packs = chose2Packs;
                    }
                    this._sendDataToSheet(data).catch(() => {});
                }
            }
        }
        this._saveState();

        // 3. викликаємо колбек onAnswer (якщо є)
        if (typeof this.config.onAnswer === 'function') {
            this.config.onAnswer(step, option, {...this.state});
        }

        // 4. можемо зробити переходи не лише "наступний крок", а умовні
        if (typeof step.nextStep === 'function') {
            const newIndex = step.nextStep({
                step,
                option,
                state: this.state,
                bot: this,
            });

            if (typeof newIndex === 'number') {
                this.state.currentStepIndex = newIndex;
            } else {
                this.state.currentStepIndex += 1;
            }
        } else if (typeof option.nextStepIndex === 'number') {
            this.state.currentStepIndex = option.nextStepIndex;
        } else {
            this.state.currentStepIndex += 1;
        }

        this._saveState();
        this._removeInteractiveBlocks();
        this._runCurrentStep();
    }

    _generateUserId() {
        return `dev-${Math.floor(Math.random() * 900000) + 100000}`
    }

    _getStepIndex(id) {
        return this.config.steps.findIndex(step => step.id === id);
    }

    _formatLocalDate(date = new Date()) {
        return (
            String(date.getHours()).padStart(2, '0') +
            ':' +
            String(date.getMinutes()).padStart(2, '0') +
            ':' +
            String(date.getSeconds()).padStart(2, '0')
        );
    }

    _formatKyivDate(date = new Date()) {
        // Конвертуємо в київський час (UTC+2 або UTC+3 залежно від літнього часу)
        const kyivDate = new Date(date.toLocaleString('en-US', { timeZone: 'Europe/Kyiv' }));

        return (
            kyivDate.getFullYear() +
            '-' +
            String(kyivDate.getMonth() + 1).padStart(2, '0') +
            '-' +
            String(kyivDate.getDate()).padStart(2, '0') +
            ' ' +
            String(kyivDate.getHours()).padStart(2, '0') +
            ':' +
            String(kyivDate.getMinutes()).padStart(2, '0') +
            ':' +
            String(kyivDate.getSeconds()).padStart(2, '0')
        );
    }

    _showDeliveryForm() {
        const form = document.querySelector('.offer__form');
        if (!form || !this.messagesContainer) return;

        // Create a dedicated bot message bubble for the delivery form once
        let host = this.messagesContainer.querySelector('#delivery-form-host');
        if (!host) {
            const message = document.createElement('div');
            message.className = 'message received message--delivery-form';
            message.innerHTML = `
          <div class="message-content">
            <div class="message-text">
              <div id="delivery-form-host"></div>
            </div>
          </div>
        `;
            this.messagesContainer.appendChild(message);
            host = message.querySelector('#delivery-form-host');
        }

        // Move the existing form node into the message host (do not clone)
        if (form.parentElement !== host) {
            host.appendChild(form);
        }

        // Спочатку форма видима, але прозора
        form.classList.remove('hidden');
        form.style.opacity = '0';
        form.style.transform = 'translateY(10px)';
        form.style.transition = 'opacity 0.3s ease, transform 0.3s ease';

        // Після невеликої затримки плавно з'являється
        setTimeout(() => {
            form.style.opacity = '1';
            form.style.transform = 'translateY(0)';
        }, 50);

        // Автозаповнення з localStorage, якщо є
        const savedName = localStorage.getItem('chatFormName');
        const savedPhone = localStorage.getItem('chatFormPhone');

        const formElement = form.querySelector('.order__form');
        if (!formElement) return;

        const nameInput = formElement.querySelector('input[name="name"]');
        const phoneInput = formElement.querySelector('input[name="phone"]');

        if (nameInput && savedName) {
            nameInput.value = savedName;
        }
        if (phoneInput && savedPhone) {
            phoneInput.value = savedPhone;
        }

        // Додаємо валідацію телефону (тільки цифри)
        if (phoneInput && !phoneInput.dataset.validationAdded) {
            phoneInput.addEventListener('input', (e) => {
                e.target.value = e.target.value.replace(/\D/g, '');
            });
            phoneInput.dataset.validationAdded = 'true';
        }

        // 👉 Додаємо обробники для відстеження змін полів
        if (!formElement.dataset.fieldTrackingAdded) {
            // Для звичайних input полів
            const regularInputs = formElement.querySelectorAll('input:not(.custom-select-input), textarea');
            regularInputs.forEach(input => {
                input.addEventListener('blur', (e) => {
                    const fieldName = e.target.name || e.target.id || 'unknown';
                    const value = e.target.value?.trim() || '';

                    if (value) {
                        this.state.answers[fieldName] = value;
                        // this._sendStepAnalytics(`delivery_${fieldName}`, value);

                        // 👉 Відправляємо в Google Sheets ***
                        this._sendDataToSheet({
                            userID: this.userID,
                            LastAction: this._formatKyivDate(),
                            [`delivery_${fieldName}`]: value,
                        }).catch(() => {
                        });

                        // Зберігаємо в localStorage для зручності ***
                        if (fieldName === 'name') {
                            localStorage.setItem('chatFormName', value);
                        } else if (fieldName === 'phone') {
                            localStorage.setItem('chatFormPhone', value);
                        }
                    }
                });
            });

            // 👉 Для кастомних селектів - слухаємо зміни значення через input подію
            const customSelectInputs = formElement.querySelectorAll('.custom-select-input');
            customSelectInputs.forEach(input => {
                // Відстежуємо зміни через input подію (коли значення змінюється програмно)
                let lastValue = input.value;

                const checkValueChange = () => {
                    const currentValue = input.value || input.dataset.value || '';
                    const fieldName = input.name || input.closest('.custom-select')?.classList[1]?.replace('form__select--', '') || 'unknown';

                    if (currentValue && currentValue !== lastValue) {
                        lastValue = currentValue;

                        // Зберігаємо в state
                        this.state.answers[fieldName] = currentValue;

                        // Відправляємо в аналітику
                        // this._sendStepAnalytics(`delivery_${fieldName}`, currentValue);
                        // 👉 Відправляємо в Google Sheets
                        this._sendDataToSheet({
                            userID: this.userID,
                            LastAction: this._formatKyivDate(),
                            [`delivery_${fieldName}`]: currentValue,
                        }).catch(() => {
                        });
                    }
                };

                // Перевіряємо зміни через input подію
                input.addEventListener('input', checkValueChange);

                // Також перевіряємо при blur
                input.addEventListener('blur', checkValueChange);

                // 👉 Додатково слухаємо кліки на елементи селекту
                const selectWrapper = input.closest('.custom-select');
                if (selectWrapper) {
                    const selectList = selectWrapper.querySelector('.custom-select-list');
                    if (selectList) {
                        // Використовуємо делегування подій для елементів селекту
                        selectList.addEventListener('click', (e) => {
                            const item = e.target.closest('.custom-select-item');
                            if (item) {
                                // Невелика затримка, щоб значення встигло встановитися
                                setTimeout(() => {
                                    checkValueChange();
                                }, 100);
                            }
                        });
                    }
                }
            });

            formElement.dataset.fieldTrackingAdded = 'true';
        }

        // Додаємо обробник submit тільки один раз
        if (!formElement.dataset.chatSubmitHandler) {
            formElement.addEventListener('submit', (e) => {
                e.preventDefault();

                // Збираємо дані форми (на випадок, якщо щось не відстежилось)
                const formData = new FormData(formElement);
                const data = Object.fromEntries(formData);

                // Також збираємо дані з кастомних селектів
                const customSelects = formElement.querySelectorAll('.custom-select-input');
                customSelects.forEach(input => {
                    const fieldName = input.name || input.closest('.custom-select')?.classList[1]?.replace('form__select--', '') || '';
                    const value = input.dataset.value || input.value || '';
                    if (value && fieldName) {
                        data[fieldName] = value;
                    }
                });

                // Зберігаємо дані в state (якщо ще не збережені)
                Object.keys(data).forEach(key => {
                    if (data[key] && !this.state.answers[key]) {
                        this.state.answers[key] = data[key];
                        this._sendStepAnalytics(`delivery_${key}`, data[key]);
                    }
                });

                // 👉 Відправляємо is_ordered: true
                this._sendDataToSheet({
                    userID: this.userID,
                    LastAction: this._formatKyivDate(),
                    is_ordered: true,
                }).catch(() => {});

                // Плавно ховаємо форму перед переходом
                form.style.opacity = '0';
                form.style.transform = 'translateY(-10px)';

                setTimeout(() => {
                    form.classList.add('hidden');
                    document.querySelector('.message--delivery-form').style.display = 'none';
                    form.style.opacity = '';
                    form.style.transform = '';

                    // Переходимо на наступний крок (final)
                    this.state.currentStepIndex += 1;
                    this._saveState();
                    this._runCurrentStep();
                }, 300);
            });

            formElement.dataset.chatSubmitHandler = 'true';
        }
    }

    async _sendDataToSheet(data) {
        const url = 'https://api.apispreadsheets.com/data/vD5znZz86KWucWkQ/';
        const query = `select *
                       from vD5znZz86KWucWkQ
                       where userID = '${this.userID}'`;

        // merge with locally stored analytics to avoid wiping columns
        const saved = this.getSavedAnalytics() || {};
        const {lastUpdated, lastUpdatedTimestamp, ...cleanSaved} = saved;
        const mergedData = {
            ...cleanSaved,
            ...data,
            LastAction: this._formatKyivDate(),
        };

        // keep local copy in sync
        this._saveAnalyticsToLocalStorage(mergedData);

        try {
            let response = await fetch(url, {
                method: 'POST',
                headers: {
                    accessKey: this.accessKey,
                    secretKey: this.secretKey,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({data: mergedData, query}),
            });

            if (response.status !== 201) {
                response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        accessKey: this.accessKey,
                        secretKey: this.secretKey,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({data: mergedData}),
                });
            }
        } catch (err) {
            console.error('Error submitting to Apispreadsheets:', err);
        }
    }

    /**
     * Логіка: на кожному кроці шлемо одне поле:
     * `${LP|Sub}_${step.id}`: value
     */
    _sendStepAnalytics(stepId, value) {
        if (!stepId) return;
        // const fieldName = `${this.chatPageKey}_${stepId}`; //для версії з subscribe123.html де є чат
        const fieldName = `${stepId}`;

        const data = {
            userID: this.userID,
            LastAction: this._formatKyivDate(),
            [fieldName]: value,
        };

        // Зберігаємо в localStorage перед відправкою
        this._saveAnalyticsToLocalStorage(data);

        // fire-and-forget, щоб не блокувати UI
        this._sendDataToSheet(data).catch(() => {
        });
    }

    /**
     * Зберігає аналітику в localStorage
     * Структура: масив об'єктів з даними кожного кроку
     */
    _saveAnalyticsToLocalStorage(data) {
        try {
            const storageKey = `chatAnalytics_${this.userID}`;
            const existing = localStorage.getItem(storageKey);
            let analytics = existing ? JSON.parse(existing) : {};

            // Оновлюємо/додаємо поля
            Object.assign(analytics, {
                ...data,
                lastUpdated: this._formatLocalDate(),
                lastUpdatedTimestamp: Date.now(),
            });

            // Зберігаємо назад
            localStorage.setItem(storageKey, JSON.stringify(analytics));
        } catch (err) {
            console.error('[ChatBot] Error saving analytics to localStorage:', err);
        }
    }

    /**
     * Отримує збережену аналітику з localStorage
     * @returns {Array|Object|null} Збережені дані або null
     */
    getSavedAnalytics() {
        try {
            const storageKey = `chatAnalytics_${this.userID}`;
            const raw = localStorage.getItem(storageKey);
            return raw ? JSON.parse(raw) : null;
        } catch (err) {
            console.error('[ChatBot] Error reading analytics from localStorage:', err);
            return null;
        }
    }

    /**
     * Очищає збережену аналітику (корисно при завершенні чату)
     */
    clearSavedAnalytics() {
        try {
            const storageKey = `chatAnalytics_${this.userID}`;
            localStorage.removeItem(storageKey);
        } catch (err) {
            console.error('[ChatBot] Error clearing analytics from localStorage:', err);
        }
    }

    _handleInputAnswer(step, value) {
        this._addMessage({from: 'user', text: value});

        if (step.id) {
            const prev = this.state.answers[step.id];
            // Only send analytics if value changed (prevents duplicate from blur)
            if (prev !== value) {
                this.state.answers[step.id] = value;
                this._sendStepAnalytics(step.id, value);

                // 👉 Відправляємо важливі поля введення ***
                const importantInputSteps = ['full_name', 'contact_phone', 'whatsapp_phone'];
                if (importantInputSteps.includes(step.id)) {
                    this._sendDataToSheet({
                        userID: this.userID,
                        LastAction: this._formatKyivDate(),
                        [step.id]: value,
                    }).catch(() => {
                    });
                }
            } else {
                // ensure state contains value even if identical
                this.state.answers[step.id] = value;
            }

            // Persist common fields
            if (step.id === 'full_name') {
                localStorage.setItem('chatFormName', value);
            } else if (step.id === 'contact_phone') {
                localStorage.setItem('chatFormPhone', value);
            }
        }

        this._saveState();

        if (typeof this.config.onAnswer === 'function') {
            this.config.onAnswer(step, value, {...this.state});
        }

        this.state.currentStepIndex += 1;
        this._saveState();
        this._removeInteractiveBlocks();
        this._runCurrentStep();
    }

    _setPixelLeadImage() {
        const params = UrlUtils.getAllSearchParams()
        const id = params?.pixel

        if (!id) {
            console.warn('After sending contact data: Pixel ID not found in URL parameters');
            return;
        }

        TrackingPixel.insertPixelImage(id, 'Lead')
    }
}

/**
 * Приклад сценарію (steps).
 * Тут ви можете легко додавати / міняти кроки, тексти, логіку переходів.
 */
const basePath = window.cdn_path || '';
const STARS_5 = `<span class="chat-review__stars">${Array(5).fill('<svg width="16" height="16" viewBox="0 0 24 24" fill="#f59e0b" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>').join('')}</span>`;

const chatSteps = [
    // +2
    // КРОК 1 — Привітання + мотивація
    {
        id: 'intro',
        messages: [
            // {text: "Test mic indicator and flexible typing delay: 5 sec", typingIndicator: 'mic', typingDelay: 5000},
            (state) => {
                if (state.answers.clicked_start_chat) {
                    return '👋 Bună! Bine ați venit la <b>Ozenmic Soft</b>.\n' +
                        'Vă voi ajuta să alegeți programul optim pentru <b>o slăbire confortabilă și sigură</b>, precum și să beneficiați de <b>reduceri suplimentare</b>.\n\n' +
                        'Plasând comanda aici, în chat, <b>nu este nevoie să așteptați apelul operatorului</b> — totul se face rapid și simplu.\n\n' +
                        'Pentru a vă recomanda programul potrivit și a vă rezerva reducerea, vă rugăm să <b>lăsați datele dvs. de contact</b>.';
                }
                return '👋 Bună! Vă mulțumim pentru comanda Ozenmic Soft.\n\n' +
                    'Aveți deja o <b>reducere de 50%</b>.\n' +
                    'Plasând comanda aici, în chat, veți <b>primi reduceri suplimentare pentru produsul ales</b> și <b> nu va mai fi nevoie să așteptați apelul operatorului</b>.\n\n' +
                    'Doriți să finalizați rapid comanda și să beneficiați de <b>o reducere suplimentară</b>?';
            }
        ],
        options: (state) => {
            if (state.answers.clicked_start_chat) {
                return []; // Не показувати кнопки, якщо чат почато через кнопку
            }
            return [
                {label: 'Da, vreau', value: 'yes'},
                {label: 'Nu', value: 'back'},
            ];
        },
        nextStep: ({option, state, bot}) => {
            // якщо користувач хоче "назад" — збережемо в відповіді
            if (option.value === 'back') {
                state.answers.exitReason = 'user_back';
                // логіка повернення – в onAnswer (redirect/history.back)
            }
            // завжди переходимо до наступного кроку
            return bot._getStepIndex('main_form_name');
        },
    },
    {
        id: 'main_form_name',
        messages: ['Vă rugăm să introduceți numele și prenumele.'],
        expectFreeInput: true,
        inputPlaceholder: 'Nume și prenume',
        shouldSkip: ({state}) => {
            // Показуємо тільки якщо натиснули кнопку старту чату
            return !state.answers.clicked_start_chat;
        },
    },
    {
        id: 'main_form_phone',
        messages: ['Vă rugăm să introduceți numărul dvs. de telefon.'],
        expectFreeInput: true,
        inputPlaceholder: 'Număr de telefon',
        shouldSkip: ({state}) => {
            // Показуємо тільки якщо натиснули кнопку старту чату
            return !state.answers.clicked_start_chat;
        },
        nextStep: ({option, state}) => {
            if (state.answers.main_form_name && state.answers.main_form_phone) {
                TrackingManager.init()
            }
        }
    },
    {
        id: 'intro_after_data',
        messages: ['Am înregistrat datele dvs., haideți să continuăm comanda cu reducere 👇'],
        options: [
            {label: 'Da, vreau', value: 'yes'},
            {label: 'Nu', value: 'back'},
        ],
        nextStep: ({option, state, bot}) => {
            // якщо користувач хоче "назад" — збережемо в відповіді
            if (option.value === 'back') {
                state.answers.exitReason = 'user_back';
                // логіка повернення – в onAnswer (redirect/history.back)
            }
            return bot._getStepIndex('goal');
        },
        shouldSkip: ({state}) => {
            // Показуємо тільки якщо натиснули кнопку старту чату
            return !state.answers.clicked_start_chat;
        },
        onEnter: (bot) => {
            bot._setPixelLeadImage()
        }
    },
    {
        id: 'goal',
        messages: ['Ce rezultat doriți să obțineți?'],
        options: [
            {label: 'Să slăbesc 5–7 kg', value: '5_7', name: '5-7 kg'},
            {label: 'Să slăbesc 8–12 kg', value: '8_12', name: '8-12 kg'},
            {label: 'Peste 12 kg / reducerea abdomenului', value: '12_plus', name: '12+ kg'},
        ],
    },
    {
        id: 'effect_audio',
        messages: [
            {
                text: `<div class="audio"><img src="${basePath}images/chat/cb-ava.png" alt="Avatar" class="message-avatar"><div class="audio-player"><div class="controls"><button class="play-pause-button play" id="audioControlButton"></button></div><audio><source src="${basePath}media/1.mp3" type="audio/mpeg"></audio><div class="progress-wrapper"><div class="progress"><div class="progress-bar"></div></div></div><div class="audio-time"><span class="audio-current__time">0:00</span></div></div></div>`,
                typingIndicator: 'mic',
                typingDelay: 12000 //12000
            }
        ],
        options: [
            {label: 'Vizualizați recenziile clienților', value: 'show_comments'},
            {label: 'Mergeți la alegerea programului', value: 'course_selection'},
        ],
        onEnter: (bot, state) => {
            // onEnter migration from id: 'goal_reco'
            const goal = state.answers.goal;
            let recommendedPacks = 4;

            // if (goal === '5_7') {
            //     recommendedPacks = 3;
            // } else if (goal === '8_12') {
            //     recommendedPacks = 5;
            // } else {
            //     recommendedPacks = 6;
            // }

            // 👉 Зберігаємо в state
            state.answers.recommended_packs = recommendedPacks;

            // 👉 Відправляємо одним запитом разом з goal (якщо він є)
            const data = {
                userID: bot.userID,
                LastAction: bot._formatKyivDate(),
                recommended_packs: recommendedPacks,
            };

            bot._sendDataToSheet(data).catch(() => {});
        },
        nextStep: ({option, state, bot}) => {
            if (option.value === 'show_comments') {
                return bot._getStepIndex('comments_1');
            }
            return bot._getStepIndex('course_choice');
        }
    },
    {
        id: 'comments_1',
        messages: [
            {
                text: `<div class="chat-review"><span class="chat-review__label">Redirecționat</span><div class="chat-review__wrapper"><div class="chat-review__header"><img src="${basePath}images/comm-ava-1.jpg" alt="" class="chat-review__avatar"><b>Maria C.</b><span class="chat-review__stars">${STARS_5}</span></div><p class="chat-review__text">Întotdeauna am fost sceptică în privința "vindecărilor miraculoase." Injecțiile hormonale nu au fost nici măcar luate în considerare din cauza posibilelor efecte secundare. Dar Ozenmic Soft m-a surprins! Principalul lucru este că nu există greață, spre deosebire de ceea ce am auzit despre alte metode. Apetitul meu a devenit mult mai controlat, iar într-o lună am slăbit 6 kg fără niciun disconfort. A fost mai ușor decât mă așteptam!</p></div></div>`,
                typingDelay: 1500
            },
            {
                text: `<div class="chat-review"><span class="chat-review__label">Redirecționat</span><div class="chat-review__wrapper"><div class="chat-review__header"><img src="${basePath}images/comm-ava-2.jpg" alt="" class="chat-review__avatar"><b>Petru U.</b><span class="chat-review__stars">${STARS_5}</span></div><p class="chat-review__text">Soția mea se plângea constant de creșterea în greutate după mai multe încercări de a pierde în greutate, în special după injecții, când greutatea a revenit din nou. Căutam ceva pentru mine care să dea un rezultat durabil. Am luat Ozenmic Soft timp de 2 luni, iar greutatea se menține cu adevărat. A dispărut dorință constantă de a lua o gustare, iar energie a apărut și mai mult. Și fără injecții!</p><img class="chat-review__live" src="${basePath}images/live1.jpg" alt="live-photo"></div></div>`,
                typingDelay: 500
            },
            {
                text: `<div class="chat-review"><span class="chat-review__label">Redirecționat</span><div class="chat-review__wrapper"><div class="chat-review__header"><img src="${basePath}images/comm-ava-3.jpg" alt="" class="chat-review__avatar"><b>Lucia V.</b><span class="chat-review__stars">${STARS_5}</span></div><p class="chat-review__text">Am 62 de ani. La vârsta mea, este greu să slăbesc și mi-a fost frică de orice experiment, în special de cele hormonale. Ozenmic Soft m-a atras pentru că este natural și nu are efecte secundare. Ceea ce m-a surprins cel mai mult a fost că umflarea a dispărut și am început să mă simt mult mai ușor după câteva săptămâni. Nu doare și este foarte convenabil de luat. Sunt foarte multumit!</p></div></div>`,
                typingDelay: 500
            }
        ],
        options: [
            { label: 'Mai multe recenzii', value: 'more_comments' },
            { label: 'Mergeți la alegerea programului', value: 'course_selection' },
        ],
        nextStep: ({ option, state, bot }) => {
            if (option.value === 'more_comments') {
                return bot._getStepIndex('comments_2');
            }
            return bot._getStepIndex('course_choice');
        },
    },
    {
        id: 'comments_2',
        messages: [
            {
                text: `<div class="chat-review"><span class="chat-review__label">Redirecționat</span><div class="chat-review__wrapper"><div class="chat-review__header"><img src="${basePath}images/comm-ava-4.jpg" alt="" class="chat-review__avatar"><b>Sofia L.</b><span class="chat-review__stars">${STARS_5}</span></div><p class="chat-review__text">După ce s-a născut copilul, mi-a fost greu să revin în formă. Am auzit o mulțime de povești înfricoșătoare despre medicamentele hormonale, așa că căutam o alternativă sigură. Ozenmic Soft s-a dovedit a fi anume ceea ce căutam. Am fost impresionată că livrarea a fost foarte rapidă, iar în câteva zile am început să iau deja capsulele. Mă simt mult mai bine, apetitul meu este sub control, iar greutatea dispare treptat. Fără stres!</p><img class="chat-review__live" src="${basePath}images/live2.jpg" alt="live-photo"></div></div>`,
                typingDelay: 1500
            },
            {
                text: `<div class="chat-review"><span class="chat-review__label">Redirecționat</span><div class="chat-review__wrapper"><div class="chat-review__header"><img src="${basePath}images/comm-ava-5.jpg" alt="" class="chat-review__avatar"><b>Lucrețiu R.</b><span class="chat-review__stars">${STARS_5}</span></div><p class="chat-review__text">Ozenmic Soft mi-a dat speranță pentru o pierdere reală în greutate. Senzația de plenitudine vine repede și nu mai sufăr de atacuri nocturne de foame. Am slăbit deja 7 kg, am de gând să continui!</p></div></div>`,
                typingDelay: 500
            },
            {
                text: `<div class="chat-review"><span class="chat-review__label">Redirecționat</span><div class="chat-review__wrapper"><div class="chat-review__header"><img src="${basePath}images/comm-ava-6.jpg" alt="" class="chat-review__avatar"><b>Ana G.</b><span class="chat-review__stars">${STARS_5}</span></div><p class="chat-review__text">Este important pentru mine ca produsul de slăbit să nu afecteze pielea și starea generală. Am citit despre probleme ale pielii de la unele injecții. Cu Ozenmic Soft nu numai că slăbesc, dar am observat și că pielea mea a devenit mai curată și mai proaspătă. Este un bonus plăcut, iar eu mă simt mai energică pe tot parcursul zilei. Fără efecte secundare!</p></div></div>`,
                typingDelay: 500
            },
        ],
        options: [
            { label: 'Mai multe recenzii', value: 'more_comments' },
            { label: 'Mergeți la alegerea programului', value: 'course_selection' },
        ],
        nextStep: ({ option, state, bot }) => {
            if (option.value === 'more_comments') {
                return bot._getStepIndex('comments_3');
            }
            return bot._getStepIndex('course_choice');
        },
    },
    {
        id: 'comments_3',
        messages: [
            {
                text: `<div class="chat-review"><span class="chat-review__label">Redirecționat</span><div class="chat-review__wrapper"><div class="chat-review__header"><img src="${basePath}images/comm-ava-7.jpg" alt="" class="chat-review__avatar"><b>Iulia O.</b><span class="chat-review__stars">${STARS_5}</span></div><p class="chat-review__text">Este foarte convenabil: iau capsulele acasă, fără injecții, fără cozi la clinică. Și livrarea a fost rapidă - am primit coletul în 3 zile. Îl recomand oricui dorește să slăbească fără fanatism.</p></div></div>`,
                typingDelay: 1500
            },
            {
                text: `<div class="chat-review"><span class="chat-review__label">Redirecționat</span><div class="chat-review__wrapper"><div class="chat-review__header"><img src="${basePath}images/comm-ava-8.jpg" alt="" class="chat-review__avatar"><b>Cristina</b><span class="chat-review__stars">${STARS_5}</span></div><p class="chat-review__text">Mi-a fost teamă să iau medicamente hormonale. E bine că l-am găsit pe Ozenmic Soft. Efectul este foarte gradual, dar constant și mi se potrivește. Am slăbit deja 6 kg în 2 luni.</p><img class="chat-review__live" src="${basePath}images/Eliana.jpg" alt="live-photo"></div></div>`,
                typingDelay: 500
            },
            {
                text: `<div class="chat-review"><span class="chat-review__label">Redirecționat</span><div class="chat-review__wrapper"><div class="chat-review__header"><img src="${basePath}images/comm-ava-9.jpg" alt="" class="chat-review__avatar"><b>Elena</b><span class="chat-review__stars">${STARS_5}</span></div><p class="chat-review__text">Am citit mult timp recenziile înainte de a cumpăra. Acum înțeleg că a meritat — mă simt mult mai bine.</p></div></div>`,
                typingDelay: 500
            },
        ],
        options: [
            { label: 'Mergeți la alegerea programului', value: 'course_selection' },
        ],
        nextStep: ({ option, state, bot }) => {
            return bot._getStepIndex('course_choice');
        },
    },
    {
        id: 'course_choice',
        messages: [
            (state) => {
                const packs = state.answers.recommended_packs;

                const courseMedium = `
                    <div class="course">
                        <b class="course-title">⭐ Curs pentru rezultate minime (4&nbsp;pachete)
                            <span class="inline-products">
                                <span class="inline-product-item"></span>
                                <span class="inline-product-item"></span>
                                <span class="inline-product-item"></span>
                                <span class="inline-product-item"></span>
                            </span>
                        </b>
                        <p class="course-text">
                            • Durata este de 6–8 săptămâni — perioada optimă pentru a declanșa arderea grăsimilor
                            <br>
                            • Declanșarea stabilă a arderii grăsimilor
                            <br>
                            • Primele schimbări vizibile în greutate și volume
                        </p>
    
                        <div class="course-price">
                            <p class="course-subtitle">
                                ✅ <b>Punctul de pornire recomandat pentru rezultate reale</b>
                            </p>
    
                            <div class="course-box">
                                <div class="course-cost">
                                    <span class="course-value">646</span>
                                    <span class="course-currency">lei </span>
                                </div>
                            </div>
                        </div>
    
                        <div class="course-delivery course-delivery--full">
                            🚚 Livrarea este inclusă în prețul comenzii
                        </div>
                    </div>
                `.trim().replace(/\s+/g, ' ')

                const courseInitiation = `
                    <div class="course">
                        <b class="course-title">Cursul de start (2&nbsp;pachete)
                            <span class="inline-products">
                                <span class="inline-product-item"></span>
                                <span class="inline-product-item"></span>
                            </span>
                        </b>
                        <p class="course-text">• Declanșarea proceselor de detoxifiere și digestie<br>• Reducerea balonării și a senzației de greutate<br>
                            • Adaptarea organismului<br></p>
    
                        <div class="course-price">
                            <p class="course-subtitle">
                                ✅ <b>Modificările de greutate în această etapă sunt minime</b>
                            </p>
    
                            <div class="course-box">
                                <div class="course-cost">
                                    <span class="course-value">368</span>
                                    <span class="course-currency">lei </span>
                                </div>
                            </div>
                        </div>
    
                        <div class="course-delivery course-delivery--full">
                            🚚 Livrarea este inclusă în prețul comenzii
                        </div>
                    </div>
                `.trim().replace(/\s+/g, ' ')

                const allCourses = [
                    { packs: 2, html: courseInitiation },
                    { packs: 4, html: courseMedium },
                ];

                const sortedCourses = allCourses.sort((a, b) => {
                    if (a.packs === packs) return -1;
                    if (b.packs === packs) return 1;
                    return a.packs - b.packs;
                });

                const coursesHTML = sortedCourses.map((course, index) => {
                    if (index === 0) {
                        return course.html.replace('<div class="course">', '<div class="course active">');
                    }
                    return course.html;
                })

                // separated text and cards
                return [
                    {
                        text: 'Cursul scurt declanșează procesul. Cel complet oferă rezultate durabile.',
                        typingDelay: 2500
                    },
                    ...coursesHTML.map((course) => ({text: course, typingDelay: 1000}))
                ]
            },
        ],
        options: [
            {label: '4 pachete', value: 4},
            {label: '2 pachete', value: 2, color: '#9ca3af'},
        ],
        nextStep: ({option, state, bot}) => {
            state.answers.course_packs = option.value;
            if (option.value === 2) {
                return bot._getStepIndex('two_packs_price');
            }
            return bot._getStepIndex('course_confirm');
        },
    },
    {
        id: 'two_packs_price',
        messages: [
            () => {
                const warningIcon = `<span class="warning-icon">⚠️</span>`
                const comparison = `
                    <div class="packages">
                        <div class="package-card">
                            <div class="package-wrapper">
                                <div class="package-info">
                                    <div class="package-title">2 cutii</div>
                                    <div class="package-price">368 <span>lei </span></div>
                                </div>
                                <div class="package-sub"><b>184 lei </b> per cutie</div>
                            </div>
                            <div class="package-note package-note--red">
                                Declanșează accelerarea metabolismului
                                <br>
                                Pregătesc organismul pentru arderea grăsimilor
                            </div>
                        </div>
        
                        <div class="package-card package-card--active">
                            <div class="package-wrapper">
                                <div class="package-info">
                                    <div class="package-title">4 cutii ⭐</div>
                                    <div class="package-price">646 <span>lei </span></div>
                                </div>
        
                                <div class="package-sub package-sub--green">
                                    <b>161 lei</b> per cutie
                                </div>
                            </div>
        
                            <div class="package-note package-note--green">
                                Proces complet de ardere a grăsimilor
                                <br>
                                Reorganizarea organismului pentru consolidarea rezultatelor
                            </div>
                        </div>
        
                        <div class="package-text">
                            Vă recomand să nu riscați și să urmați cursul complet de la prima încercare
                        </div>
                    </div>
                `.trim().replace(/\s+/g, ' ');

                return [
                    'Bine, am notat 2 pachete',
                    'Văd că sunteți la noi pentru prima dată — vreau să simțiți rezultatul imediat, așa că vă voi spune sincer',
                    `<span class="accent-text">${warningIcon} 2 cutii nu fac decât să declanșeze procesele în organism. În această etapă, greutatea practic încă nu scade — produsul acționează ușor și treptat.</span>`,
                    `Anume de aceea, majoritatea clienților cumpără direct 4 cutii și observă rezultatele încă din prima lună. ${comparison}`,
                ]
            }
        ],
        options: [
            {label: 'Treciți la 4 pachete', value: 4, color: 'green'},
            {label: 'Păstrați 2 pachete', value: 2, color: '#9ca3af'},
        ],
        shouldSkip: ({state}) => state.answers.course_packs !== 2,
        nextStep: ({option, state, bot}) => {
            state.answers.course_packs = option.value;
            if (option.value === 2) {
                return bot._getStepIndex('two_packs_upsell');
            }
            return bot._getStepIndex('course_confirm');
        },
    },
    {
        id: 'two_packs_upsell',
        messages: [
            () => {
                const comparison = `
                    <div class="packages">
        
                        <!-- 2 cutii -->
                        <div class="package-card">
                            <div class="package-wrapper">
                                <div class="package-info">
                                    <div class="package-title">2 cutii</div>
                                    <div class="package-price">
                                        368
                                        <span>lei </span>
                                    </div>
                                </div>
        
                                <div class="package-sub">
                                    <b>184 lei </b> per cutie
                                </div>
                            </div>
        
                        </div>
        
                        <!-- 4 пачки -->
                        <div class="package-card">
                            <div class="package-wrapper">
                                <div class="package-info">
                                    <div class="package-title">4 cutii</div>
                                    <div class="package-price">
                                        646
                                        <span>lei </span>
                                    </div>
                                </div>
        
                                <div class="package-sub">
                                    <b>161 lei </b> per cutie
                                </div>
                            </div>
                        </div>
        
                        <!--5 cutii VIP -->
                        <div class="package-card package-card--vip">
                            <div class="package-badge">VIP</div>
        
                            <div class="package-wrapper">
                                <div class="package-info">
                                    <div class="package-title">5 cutii</div>
                                    <div class="package-price">
                                        558
                                        <span>lei </span>
                                    </div>
                                </div>
        
                                <div class="package-sub package-sub--green">
                                    <b>111 lei</b> per cutie
                                </div>
                            </div>
                        </div>
        
        
                        <div class="package-text">
                            <div class="course-delivery course-delivery--inner">
                                🚚 Livrarea este inclusă în prețul comenzii
                            </div>
        
                            Plătiți mai puțin pentru 5 cutii decât pentru 4 — și primiți un curs complet cu rezultate de durată
                        </div>
                    </div>    
                `.trim().replace(/\s+/g, ' ');

                return [
                    'Bine, am notat',
                    'Deoarece sunteți la noi pentru prima dată, v-am pregătit o ofertă specială, pentru ca dvs. să simțiți rezultatul maxim. Este un pachet VIP, destinat unuia dintre primii 100 de clienți ai noștri.',
                    `⭐ <b>Comparați opțiunile</b> ${comparison}`,
                ]
            }
        ],
        options: [
            {label: 'Luați 5 cutii', value: 5, color: 'green'},
            {label: 'Păstrați 2 pachete', value: 2, color: '#9ca3af'},
        ],
        nextStep: ({option, state, bot}) => {
            state.answers.course_packs = option.value;
            return bot._getStepIndex('course_confirm');
        },
    },
    {
        id: 'course_confirm',
        messages: [
            state => {
                const packs = state.answers.course_packs || 3;
                // const priceMap = {
                //     2: 1380,
                //     3: 1480,
                //     5: 1880,
                //     6: 2450,
                // };
                const priceMap = {
                    2: 368,
                    4: 646,
                    5: 558
                };
                const price = priceMap[packs];
                return {
                    text: `Mulțumim pentru comandă! Alegerea dvs.: <b>${packs} pachete Ozenmic Soft</b>. Preț: <b>${price}&nbsp;lei </b>\nAcum vom organiza livrarea.`,
                    typingDelay: 1000
                };
            },
        ],
        onEnter: (bot, state) => {
            const packs = parseInt(state.answers.course_packs) || 4;
            bot._showProductAnimation(packs);

            // 👉 Відправляємо course_choice в таблицю
            const data = {
                userID: bot.userID,
                LastAction: bot._formatKyivDate(),
                course_choice: packs,
            };

            bot._sendDataToSheet(data).catch(() => {
            });
        },
    },
    {
        id: 'full_name',
        messages: [
            {
                text: 'Vă rugăm să introduceți numele și prenumele destinatarului.',
                typingDelay: 2000
            }
        ],
        expectFreeInput: true,
        inputPlaceholder: 'Nume și prenume',
    },

    {
        id: 'contact_phone',
        messages: ['Vă rugăm să introduceți numărul dvs. de telefon.'],
        expectFreeInput: true,
        inputPlaceholder: 'Număr de telefon',
    },
    {
        id: 'delivery_phone_type',
        messages: ['Confirmați numărul pentru livrare:'],
        options: [
            {label: 'Numărul indicat la comandă', value: 'from_form', name: 'From form'},
            {label: 'Număr WhatsApp', value: 'whatsapp', name: 'WhatsApp'},
        ],
    },
    {
        id: 'whatsapp_phone',
        messages: ['Introduceți numărul pentru WhatsApp:'],
        expectFreeInput: true,
        inputPlaceholder: 'Număr de telefon',
        shouldSkip: ({state}) => {
            // Пропускаємо цей крок, якщо обрано "Вказаний раніше"
            return state.answers.delivery_phone_type !== 'whatsapp';
        },
    },
    {
        id: 'delivery_form',
        messages: [
            'Mai jos va apărea formularul pentru livrare.',
            'Vă rugăm să completați toate câmpurile.',
        ],
        showForm: true, // 👉 прапорець для показу форми
    },
    {
        id: 'final',
        messages: [
            {
                text: '🎉 Mulțumim! Comanda a fost înregistrată și este în curs de procesare.\nVeți primi un mesaj prin <b>WhatsApp sau SMS</b> cu detaliile livrării.',
                typingDelay: 2000
            }
        ],
    },
];

/**
 * Карта тригерів → значень прогресу.
 * Ключ: `${stepId}` або `${stepId}:${optionValue}` для конкретної кнопки.
 * Значення: відсоток прогресу після цього вибору.
 */
const PROGRESS_MAP = [
    { key: 'intro:yes',              value: 14  },
    { key: 'intro_after_data:yes',   value: 14  },
    { key: 'goal',                   value: 28  },
    { key: 'course_choice',          value: 42  },
    { key: 'price_calculation:confirm', value: 57 },
    { key: 'two_packs_price',        value: 57  },
    { key: 'full_name',              value: 71  },
    { key: 'contact_phone',          value: 85  },
    { key: 'delivery_form_submit',   value: 100 },
];

// Ініціалізація чатбота після завантаження DOM
document.addEventListener('DOMContentLoaded', () => {
    // --- Progress Bar ---
    const chatProgress = new ChatBotProgress({
        barSelector:   '#chatProgressBar',
        fillSelector:  '#chatProgressFill',
        labelSelector: '#chatProgressLabel',
        currentStepSelector: '#chatProgressCurrStep',
        totalStepsSelector: '#chatProgressTotalSteps'
    });

    // --- ChatBot ---
    const bot = new ChatBot({
        messagesContainer: '#chatMessages',
        root: '.chat-bot',
        steps: chatSteps,
        typingDelayPerChar: 50,  // ms per character (default: 15) human style: 50
        typingDelayMin: 2000,     // minimum delay in ms (default: 2000)
        typingDelayMax: 4000,    // maximum delay in ms (default: 4000)
        startQueue: {
            enabled: true,
            delay: () => 10000 + Math.floor(Math.random() * 5001), // 10–15 sec
            // delay: () => 1000,
            text: `
                <h3 class="chat-queue-card__title">Sunteți primul pe listă 🥇</h3>
                <p class="chat-queue-card__text">Specialiștii se vor conecta în curând la chat. Vă rugăm să așteptați puțin.</p>
            `,
            showTyping: false,
            typingIndicator: 'dots',
            showCountdown: true,
            countdownLabel: 'Rămase:',
        },
        // storageKey: 'flexible_chat_bot_state', // прибрали, щоб не зберігати історію
        onAnswer: (step, answer, state) => {
            // місце для аналітики / API
            // Формуємо ключ пошуку: спочатку точний "stepId:value", потім загальний "stepId"
            const specificKey = `${step.id}:${answer?.value ?? answer}`;
            const generalKey  = `${step.id}`;

            let progressValue = null;

            const specificMatch = PROGRESS_MAP.find(item => item.key === specificKey);
            const generalMatch  = PROGRESS_MAP.find(item => item.key === generalKey);

            const currentMatch = generalMatch || specificMatch;
            const progressByPercents = Object.groupBy(PROGRESS_MAP, ({value}) => value)
            const currentStepIndex = currentMatch ? Object.keys(progressByPercents).indexOf(String(currentMatch['value'])) : null

            if (currentStepIndex !== null) {
                chatProgress.setSteps(currentStepIndex + 1);
            }

            if (specificMatch !== undefined) {
                progressValue = specificMatch.value;
            } else if (generalMatch !== undefined) {
                progressValue = generalMatch.value;
            }

            if (progressValue !== null && progressValue > chatProgress.current) {
                chatProgress.setProgress(progressValue);
            }
        },
        onFinish: state => {
            // При завершенні — 100%
            chatProgress.setProgress(100);
            chatProgress.setSteps(chatProgress.getTotalStepsValue(PROGRESS_MAP))

            const chatRoot = document.querySelector('.chat-bot');
            if (!chatRoot) return;

            // дати користувачу 5 секунд дочитати фінальне повідомлення
            setTimeout(() => {
                // якщо вже закритий — нічого не робимо
                if (!chatRoot || chatRoot.classList.contains('hidden')) return;

                if (window.location.pathname.includes('subscribe')) {
                    // ми вже на сторінці оформлення → просто закриваємо чат
                    chatRoot.classList.add('hidden');
                    setBodyScrollLock(false);
                } else {
                    // на LP → після паузи редіректимо на subscribe
                    // window.location.href = 'subscribe123.html';
                    window.location.href = 'subscribe123.html?pixel=' + UrlUtils.getAllSearchParams()?.pixel;
                }
            }, 5000);
        },
    });

    // 👉 Зберігаємо екземпляр бота глобально
    window.chatBotInstance = bot;
    window.chatProgressInstance = chatProgress; // для доступу ззовні

    // bot.initInfoPanel();
    bot.initProfile();
    bot.initClose();
    bot.initModal();

    // 👉 Ініціалізуємо відстеження .main__form
    initMainFormTracking(bot);

    // --- Тригер 100% при submit форми доставки ---
    // Перехоплюємо submit форми .offer__form через делегування
    document.addEventListener('submit', e => {
        const offerForm = e.target.closest('.offer__form');
        if (offerForm) {
            chatProgress.setProgress(100);
            chatProgress.setSteps(chatProgress.getTotalStepsValue(PROGRESS_MAP))
        }
    });
});

function setupAudioPlayer(audioPlayer) {
    if (!audioPlayer) return;

    const audio = audioPlayer.querySelector('audio');
    const playPauseButton = audioPlayer.querySelector('.play-pause-button');
    const progressContainer = audioPlayer.querySelector('.progress');
    const progressBar = audioPlayer.querySelector('.progress-bar');
    const currentTimeDisplay = audioPlayer.querySelector('.audio-current__time');

    if (!audio || !playPauseButton || !progressBar || !currentTimeDisplay) return;

    let isPlaying = false;

    // Seek on click
    progressContainer.addEventListener('click', (e) => {
        const rect = progressContainer.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const ratio = Math.max(0, Math.min(1, clickX / rect.width));
        if (audio.duration && isFinite(audio.duration)) {
            audio.currentTime = ratio * audio.duration;
        }
    });

    // Drag-seek
    let isDragging = false;

    progressContainer.addEventListener('mousedown', (e) => {
        isDragging = true;
        const rect = progressContainer.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        if (audio.duration && isFinite(audio.duration)) {
            audio.currentTime = ratio * audio.duration;
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const rect = progressContainer.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        if (audio.duration && isFinite(audio.duration)) {
            audio.currentTime = ratio * audio.duration;
        }
    });

    document.addEventListener('mouseup', () => { isDragging = false; });

    // Touch
    progressContainer.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = progressContainer.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
        if (audio.duration && isFinite(audio.duration)) {
            audio.currentTime = ratio * audio.duration;
        }
    }, { passive: false });

    progressContainer.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = progressContainer.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
        if (audio.duration && isFinite(audio.duration)) {
            audio.currentTime = ratio * audio.duration;
        }
    }, { passive: false });

    playPauseButton.addEventListener("click", () => {
        if (isPlaying) {
            audio.pause();
            playPauseButton.classList.remove('pause');
            playPauseButton.classList.add('play');
        } else {
            audio.play();
            playPauseButton.classList.remove('play');
            playPauseButton.classList.add('pause');
        }
        isPlaying = !isPlaying;
    });

    audio.addEventListener("timeupdate", () => {
        const currentTime = audio.currentTime;
        const duration = audio.duration;

        const currentMinutes = Math.floor(currentTime / 60);
        const currentSeconds = Math.floor(currentTime % 60);
        currentTimeDisplay.textContent = `${currentMinutes}:${currentSeconds < 10 ? '0' : ''}${currentSeconds}`;

        const progress = (currentTime / duration) * 100;
        progressBar.style.width = `${progress}%`;
    });

    audio.addEventListener("ended", () => {
        playPauseButton.classList.remove('pause');
        playPauseButton.classList.add('play');
        isPlaying = false;
    });
}

function resetChatAudio(root = document) {
    root.querySelectorAll('.audio-player').forEach((audioPlayer) => {
        const audio = audioPlayer.querySelector('audio');
        const playPauseButton = audioPlayer.querySelector('.play-pause-button');
        const progressBar = audioPlayer.querySelector('.progress-bar');
        const currentTimeDisplay = audioPlayer.querySelector('.audio-current__time');

        if (!audio) return;

        audio.pause();
        audio.currentTime = 0;

        if (playPauseButton) {
            playPauseButton.classList.remove('pause');
            playPauseButton.classList.add('play');
        }
        if (progressBar) {
            progressBar.style.width = '0%';
        }
        if (currentTimeDisplay) {
            currentTimeDisplay.textContent = '0:00';
        }
    });
}

function normalizeTime(timeValue) {
    const [time, period] = timeValue.split(' ');

    let hours = parseInt(time.split(':')[0]);
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;

    return `${String(hours).padStart(2, '0')}:00`;
}

function handleFormSubmit(form) {
    const inputs = form.querySelectorAll('input, textarea, select');
    let allFilled = true;

    inputs.forEach(input => {
        const value = input.value.trim();

        // Проверка на пустое значение
        if (!value) {
            allFilled = false;
            input.classList.add('error');
            return;
        }

        // Дополнительная проверка для телефона
        if (input.name === 'phone' && value.length < 8) {
            allFilled = false;
            input.classList.add('error');
        }
    });

    if (allFilled) {
        chatBot.classList.remove('hidden');
        setBodyScrollLock(true);
    }

    return allFilled;
}

function setBodyScrollLock(isLocked) {
    document.documentElement.classList.toggle('chat-scroll-lock', isLocked);
    document.body.classList.toggle('chat-scroll-lock', isLocked);
}

function syncBodyScrollLockWithChat() {
    const chatRoot = document.querySelector('.chat-bot');
    const isChatOpen = !!chatRoot && !chatRoot.classList.contains('hidden');
    setBodyScrollLock(isChatOpen);
}

// Зберігаємо дані форми в localStorage для автозаповнення в чаті
function saveFormDataToStorage() {
    const mainForm = document.querySelector('.main__form');
    if (!mainForm) return;

    const nameInput = mainForm.querySelector('input[name="name"]');
    const phoneInput = mainForm.querySelector('input[name="phone"]');

    if (nameInput && nameInput.value.trim()) {
        localStorage.setItem('chatFormName', nameInput.value.trim());
    }
    if (phoneInput && phoneInput.value.trim()) {
        localStorage.setItem('chatFormPhone', phoneInput.value.trim());
    }
}

// 👉 Ініціалізація відстеження полів .main__form
function initMainFormTracking(bot) {
    const mainForm = document.querySelector('.main__form');
    if (!mainForm || mainForm.dataset.trackingAdded) return;

    const nameInput = mainForm.querySelector('input[name="name"]');
    const phoneInput = mainForm.querySelector('input[name="phone"]');

    // Обробник blur для ім'я
    if (nameInput) {
        nameInput.addEventListener('blur', () => {
            const value = nameInput.value.trim();
            if (value) {
                localStorage.setItem('chatFormName', value);
                bot._sendDataToSheet({
                    userID: bot.userID,
                    LastAction: bot._formatKyivDate(),
                    main_form_name: value,
                }).catch(() => {
                });
            }
        });
    }

    // Обробник blur для телефону
    if (phoneInput) {
        phoneInput.setAttribute('inputmode', 'numeric');
        phoneInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/\D/g, '');
        });

        phoneInput.addEventListener('blur', () => {
            const value = phoneInput.value.trim();
            if (value && value.length >= 8) {
                localStorage.setItem('chatFormPhone', value);
                bot._sendDataToSheet({
                    userID: bot.userID,
                    LastAction: bot._formatKyivDate(),
                    main_form_phone: value,
                }).catch(() => {
                });
            }
        });
    }

    mainForm.dataset.trackingAdded = 'true';
}

// Зберігаємо дані при зміні полів форми
document.addEventListener('input', e => {
    const input = e.target;
    if (input.closest('.main__form')) {
        saveFormDataToStorage();
    }
});

document.addEventListener('submit', e => {
    const form = e.target.closest('.main__form');
    if (!form) return;

    e.preventDefault();

    if (handleFormSubmit(form)) {
        const bot = window.chatBotInstance;
        const progress = window.chatProgressInstance;

        if (bot) {
            // 👉 Збираємо дані з форми
            const nameInput = form.querySelector('input[name="name"]');
            const phoneInput = form.querySelector('input[name="phone"]');

            // 👉 Зберігаємо в state
            if (nameInput && nameInput.value.trim()) {
                bot.state.answers.main_form_name = nameInput.value.trim();
                localStorage.setItem('chatFormName', nameInput.value.trim());
            }
            if (phoneInput && phoneInput.value.trim()) {
                bot.state.answers.main_form_phone = phoneInput.value.trim();
                localStorage.setItem('chatFormPhone', phoneInput.value.trim());
            }
            bot._saveState();

            if (bot.state.answers.main_form_name && bot.state.answers.main_form_phone) {
                TrackingManager.init();
            }

            // 👉 Відправляємо в Google Sheets
            const data = {
                userID: bot.userID,
                LastAction: bot._formatKyivDate(),
            };
            if (nameInput && nameInput.value.trim()) {
                data.main_form_name = nameInput.value.trim();
            }
            if (phoneInput && phoneInput.value.trim()) {
                data.main_form_phone = phoneInput.value.trim();
            }
            bot._sendDataToSheet(data).catch(() => {});
            bot._setPixelLeadImage();

            // Запускаємо чат
            bot.state.answers.clicked_start_chat = false;
            bot.start();
            if (progress) progress.reset();
        }
    }
});

//start chat button
// const startChatBtn = document.querySelector('.chat-btn');
const startChatBtns = document.querySelectorAll('.chat-btn');

startChatBtns.forEach((startChatBtn) => {
    startChatBtn.addEventListener('click', () => {
        chatBot.classList.remove('hidden');
        setBodyScrollLock(true);

        const bot = window.chatBotInstance;
        const progress = window.chatProgressInstance;

        if (bot) {
            bot.state.answers.clicked_start_chat = true;
            bot.start();
            if (progress) progress.reset();

            bot._sendDataToSheet({
                userID: bot.userID,
                LastAction: bot._formatKyivDate(),
                clicked_start_chat: true,
            }).catch(() => {});
        }
    });
});


// startChatBtn?.addEventListener('click', () => {
//     chatBot.classList.remove('hidden');
//     setBodyScrollLock(true);
//
//     // 👉 Відправляємо інформацію про натискання кнопки старту чату
//     const bot = window.chatBotInstance;
//     const progress = window.chatProgressInstance;
//
//     if (bot) {
//         // 👉 Встановлюємо прапорець
//         bot.state.answers.clicked_start_chat = true;
//
//         bot.start();
//
//         // 👉 Скидаємо прогрес при новому старті
//         if (progress) progress.reset();
//
//         bot._sendDataToSheet({
//             userID: bot.userID,
//             LastAction: bot._formatKyivDate(),
//             clicked_start_chat: true,
//         }).catch(() => {
//         });
//     }
// });

// modal close
const chatBot = document.querySelector('.chat-bot');
const endModal = document.getElementById('endConsultationModal');
const modalConfirmBtn = document.getElementById('confirmEnd');

modalConfirmBtn.addEventListener('click', () => {
    chatBot.classList.add('hidden');
    setBodyScrollLock(false);
    endModal.classList.remove('active');
});

// Снятие ошибки при вводе
document.addEventListener('input', e => {
    const input = e.target;
    if (input.closest('.main__form') && input.value.trim()) {
        if (input.name === 'phone') {
            if (input.value.trim().length >= 8) {
                input.classList.remove('error');
            }
        } else {
            input.classList.remove('error');
        }
    }
});

// ── Action Popup ──────────────────────────────────────────
(function initActionPopup() {
    const popup      = document.getElementById('actionPopup');
    const overlay    = popup?.querySelector('.action-popup__overlay');
    const nameInput  = document.getElementById('actionPopupName');
    const phoneInput = document.getElementById('actionPopupPhone');
    const sendBtn    = document.getElementById('actionPopupSend');
    const backBtn    = document.getElementById('actionPopupBack');
    const successEl  = document.getElementById('actionPopupSuccess');

    if (!popup) return;

    let closeTimer = null;

    // --- helpers ---
    function openPopup() {
        // Pre-fill from localStorage if available
        const savedName  = localStorage.getItem('chatFormName')  || '';
        const savedPhone = localStorage.getItem('chatFormPhone') || '';

        nameInput.value  = savedName;
        phoneInput.value = savedPhone;

        // Reset UI state
        successEl.hidden = true;
        nameInput.classList.remove('error');
        phoneInput.classList.remove('error');
        sendBtn.disabled = false;
        sendBtn.textContent = sendBtn.dataset.text

        popup.classList.add('active');
        popup.setAttribute('aria-hidden', 'false');
        nameInput.focus();
    }

    function closePopup() {
        popup.classList.remove('active');
        popup.setAttribute('aria-hidden', 'true');
        if (closeTimer) {
            clearTimeout(closeTimer);closeTimer = null;
        }}

    // --- phone: digits only ---
    phoneInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '');
    });

    // --- send ---
    sendBtn.addEventListener('click', async () => {
        const name  = nameInput.value.trim();
        const phone = phoneInput.value.trim();

        // Basic validation
        let valid = true;
        nameInput.classList.remove('error');
        phoneInput.classList.remove('error');

        if (!name) {
            nameInput.classList.add('error');
            valid = false;
        }
        if (!phone || phone.length < 8) {
            phoneInput.classList.add('error');
            valid = false;
        }
        if (!valid) return;

        sendBtn.disabled = true;
        sendBtn.textContent = sendBtn.dataset.process

        // Persist to localStorage
        localStorage.setItem('chatFormName',  name);
        localStorage.setItem('chatFormPhone', phone);

        // Send via bot helper (same pattern used elsewhere in the file)
        try {
            await window.chatBotInstance?._sendDataToSheet({
                userID:       window.chatBotInstance.userID,
                LastAction:   window.chatBotInstance._formatKyivDate(),
                full_name:     name,
                contact_phone: phone,
            });
        } catch (_) {
            // fire-and-forget — don't block UX on network error
        }

        // Show success, then auto-close after 3 s
        successEl.hidden = false;
        closeTimer = setTimeout(closePopup, 3000);
    });

    // --- back / overlay → close immediately ---
    backBtn.addEventListener('click', closePopup);
    overlay.addEventListener('click', closePopup);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && popup.classList.contains('active')) {
            closePopup();
        }
    });

    // --- bind all .action-btn triggers ---
    document.querySelectorAll('.action-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            openPopup();
        });
    });
})();
