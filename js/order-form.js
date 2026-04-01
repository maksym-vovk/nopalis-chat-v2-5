class CustomSelect {
    constructor(selectWrapper, type) {
        this.selectWrapper = selectWrapper;
        this.input = selectWrapper.querySelector('.custom-select-input');
        this.list = selectWrapper.querySelector('.custom-select-list');
        this.type = type;

        this.sourceItems = [];
        this.inputDebounce = null;

        this.addEventListeners();
    }

    async loadData(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Ошибка загрузки данных: ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            console.error(error);
            return { cities: [] };
        }
    }

    async createSelect(data) {
        this.list.innerHTML = '';

        if (!data.cities || !Array.isArray(data.cities)) {
            console.error("Данные о городах не найдены или не в правильном формате.");
            return;
        }

        // Keep raw data in memory; do not render full DOM list for huge datasets.
        this.sourceItems = data.cities.map(item => ({
            ...item,
            _search: (item.name || '').toLowerCase()
        }));

        // For city: start empty to avoid initial heavy paint.
        if (this.type === 'city') {
            this.renderItems([]);
            return;
        }

        // For small lists (zipcode etc.) render all.
        this.renderItems(this.sourceItems);

        // data.cities.forEach(item => {
        //     const option = document.createElement('li');
        //     option.classList.add('custom-select-item');
        //     option.dataset.value = item.value;
        //     option.textContent = item.name;
        //     option.addEventListener('click', () => this.selectItem(item));
        //     this.list.appendChild(option);
        // });
        //
        // this.items = this.list.querySelectorAll('.custom-select-item');
    }

    renderItems(items) {
        this.list.innerHTML = '';

        items.forEach(item => {
            const option = document.createElement('li');
            option.classList.add('custom-select-item');
            option.dataset.value = item.value;
            option.textContent = item.name;
            option.addEventListener('click', () => this.selectItem(item));
            this.list.appendChild(option);
        });
    }

    addEventListeners() {
        this.input.addEventListener('click', () => this.openSelect());
        document.addEventListener('click', (e) => this.closeSelect(e));

        this.input.addEventListener('input', () => {
            clearTimeout(this.inputDebounce);
            this.inputDebounce = setTimeout(() => {
                if (this.type === 'city') {
                    this.input.dataset.value = '';
                }

                this.filterItems();
                this.validate();
            }, 80);
        });

        document.querySelectorAll('input:not([name="landmark"])').forEach(input => {
            input.addEventListener('input', () => this.checkFormValidity());
        });
    }

    // openSelect() {
    //     this.selectWrapper.classList.add('open');
    // }

    openSelect() {
        this.selectWrapper.classList.add('open');
        this.filterItems();
    }


    closeSelect(e) {
        if (!this.selectWrapper.contains(e.target)) {
            this.selectWrapper.classList.remove('open');
        }
    }

    filterItems() {
        const filter = this.input.value.trim().toLowerCase();

        if (this.type === 'city') {
            // Порожній ввід — показуємо перші 200 міст
            if (filter.length === 0) {
                // this.renderItems(this.sourceItems.slice(0, 200));
                this.renderItems(this.sourceItems);
                return;
            }

            // 1+ символ — фільтруємо
            const matches = this.sourceItems
                .filter(item => item._search.includes(filter))
                .slice(0, 100);

            this.renderItems(matches);
            return;
        }

        // Fallback for small lists (zipcode etc.)
        const items = this.list.querySelectorAll('.custom-select-item');
        items.forEach((item) => {
            item.style.display = item.textContent.toLowerCase().includes(filter) ? 'block' : 'none';
        });
    }

    // filterItems() {
    //     const filter = this.input.value.toLowerCase();
    //     this.list.querySelectorAll('.custom-select-item').forEach((item) => {
    //         item.style.display = item.textContent.toLowerCase().includes(filter) ? 'block' : 'none';
    //     });
    // }

    selectItem(item) {
        this.input.value = item.name;
        this.input.dataset.value = item.value;
        this.selectWrapper.classList.remove('open');
        this.updateMainData(this.type, item.value);

        if (this.type === 'city') {
            // this.loadColony(item.value);
            // document.querySelector('.form__select--colony .custom-select-input').disabled = false;

            // Reuse zipcode select instance to avoid stacking listeners.
            if (!this.zipcodeSelect) {
                const zipcodeWrapper = document.querySelector('.form__select--zipcode');
                if (zipcodeWrapper) {
                    this.zipcodeSelect = new CustomSelect(zipcodeWrapper, 'postal_code');
                }
            }

            this.updateZipcode(item.postal_codes || []);
            const zipcodeInput = document.querySelector('.form__select--zipcode .custom-select-input');
            if (zipcodeInput) zipcodeInput.disabled = false;
            //
            // // Якщо колонії більше не використовуються:
            // const colonyInput = document.querySelector('.form__select--colony .custom-select-input');
            // if (colonyInput) {
            //     colonyInput.value = '';
            //     colonyInput.disabled = true;
            //     colonyInput.required = false;
            // }
        // } else if (this.type === 'colonia') {
        //     this.updateZipcode(item);
        //     document.querySelector('.form__select--zipcode .custom-select-input').disabled = false;
        }

        this.validate();
    }

    // async loadColony(cityValue) {
    //     try {
    //         const coloniesData = await this.loadData(`data/colonias/${cityValue}.json`);
    //         this.createSelectColony(coloniesData);
    //     } catch (error) {
    //         console.error("Ошибка загрузки колоний:", error);
    //     }
    // }

    // createSelectColony(data) {
    //     const colonySelect = new CustomSelect(document.querySelector('.form__select--colony'), 'colonia');
    //
    //     const colonies = data.data.map(item => ({
    //         value: item.colonia,
    //         name: item.colonia,
    //         city: item.city,
    //         colonia: item.colonia,
    //         postal_code: item.postal_code,
    //     }));
    //
    //     colonySelect.createSelect({ cities: colonies });
    // }

    updateZipcode(postalCodes) {
        // const zipcodeSelect = new CustomSelect(
        //     document.querySelector('.form__select--zipcode'),
        //     'postal_code'
        // );
        const zipcodeSelect = this.zipcodeSelect;

        const uniquePostalCodes = [...new Set(
            (postalCodes || []).filter(Boolean).map(String)
        )];

        const zipcodeInput = document.querySelector('.form__select--zipcode .custom-select-input');
        // if (!zipcodeInput) return;
        if (!zipcodeInput || !zipcodeSelect) return;

        // Prevent stale value from previous city from being submitted.
        zipcodeInput.dataset.value = '';

        if (!uniquePostalCodes.length) {
            zipcodeInput.value = '';
            zipcodeInput.dataset.value = '';
            zipcodeSelect.createSelect({ cities: [] });
            this.checkFormValidity();
            return;
        }

        if (uniquePostalCodes.length >= 1) {
            const firstCode = uniquePostalCodes[0];
            zipcodeInput.value = firstCode;
            zipcodeInput.dataset.value = firstCode;
            this.updateMainData('postal_code', firstCode);
        } else {
            zipcodeInput.value = '';
            zipcodeInput.dataset.value = '';
        }

        zipcodeSelect.createSelect({
            cities: uniquePostalCodes.map(code => ({
                value: code,
                name: code
            }))
        });

        this.checkFormValidity();
    }

    // updateZipcode(colony) {
    //     const zipcodeSelect = new CustomSelect(document.querySelector('.form__select--zipcode'), 'postal_code');
    //     const uniquePostalCodes = [...new Set(colony.postal_code)];
    //
    //     if (!uniquePostalCodes.length) return;
    //
    //     const zipcodeInput = document.querySelector('.form__select--zipcode .custom-select-input');
    //
    //     if (uniquePostalCodes.length === 1) {
    //         zipcodeInput.value = uniquePostalCodes[0]
    //         this.updateMainData('postal_code', uniquePostalCodes[0]);
    //     } else {
    //         zipcodeInput.value = '';
    //     }
    //
    //     zipcodeSelect.createSelect({
    //         cities: uniquePostalCodes.map(code => ({
    //             value: code,
    //             name: code
    //         }))
    //     });
    //
    //     this.checkFormValidity();
    // }

    updateMainData(inputName, value) {
        // sendData.mainData[inputName] = value;
        // sendData.sendData(sendData.mainData);
    }

    validate() {
        const input = this.input;
        const rawValue = input.value.trim();
        const value = rawValue.toLowerCase();

        // Empty required field is invalid.
        if (!value) {
            input.classList.add('error');
            this.checkFormValidity();
            return;
        }

        // City has special UX: user types, we search from 2+ chars.
        if (this.type === 'city') {
            const selectedByClick = Boolean(input.dataset.value);

            // Do not show error while user just started typing.
            if (!selectedByClick && value.length < 2) {
                input.classList.remove('error');
                this.checkFormValidity();
                return;
            }

            const exactMatch = this.sourceItems.some(item => item._search === value);
            const hasMatches = value.length >= 2
                ? this.sourceItems.some(item => item._search.includes(value))
                : false;

            // Valid if selected from list OR exact city name typed.
            const isValid = selectedByClick || exactMatch;

            // Show error only when there are no matches or invalid final value.
            if (!isValid && !hasMatches) {
                input.classList.add('error');
            } else {
                input.classList.remove('error');
            }

            this.checkFormValidity();
            return;
        }

        // Default behavior for other selects (zipcode etc.)
        const hasVisibleItems = Array.from(this.list.children)
            .some(item => item.style.display !== 'none');

        if (!hasVisibleItems) {
            input.classList.add('error');
        } else {
            input.classList.remove('error');
        }

        this.checkFormValidity();
    }


    // validate() {
    //     const input = this.input;
    //     const value = input.value.trim().toLowerCase();
    //     const hasVisibleItems = Array.from(this.list.children).some(item => item.style.display !== 'none');
    //
    //     if (!value || !hasVisibleItems) {
    //         input.classList.add('error');
    //     } else {
    //         input.classList.remove('error');
    //     }
    //
    //     this.checkFormValidity();
    // }

    checkFormValidity() {
        const offerForm = document.querySelector('.offer__form');
        // const requiredFields = offerForm.querySelectorAll('input:not([name="landmark"])');
        const requiredFields = offerForm.querySelectorAll('input[required]:not(:disabled)');
        const allValid = Array.from(requiredFields).every(input => input.value.trim() !== '');
        this.disableSubmitButton(!allValid);
    }

    disableSubmitButton(isDisabled) {
        const submitButton = document.querySelector('.form__btn');
        if (submitButton) {
            submitButton.disabled = isDisabled;
        }
    }
}

// class SelectFromArray extends CustomSelect {
//     constructor(selectWrapper) {
//         super(selectWrapper, 'type_street');
//         this.createStreetSelect();
//     }
//
//     createStreetSelect() {
//         const streetTypes = [
//             { value: "avenida", name: "Avenida Av." },
//             { value: "cerrada", name: "Cerrada Cda." },
//             { value: "circuito", name: "Circuito Cto." },
//             { value: "calle", name: "Calle Cl." },
//             { value: "colonia", name: "Colonia Col." },
//             { value: "eje_vial", name: "Eje vial Eje" },
//             { value: "pasaje", name: "Pasaje Pje." },
//             { value: "prolongación", name: "Prolongación Prol." },
//             { value: "ronda", name: "Ronda Rda." },
//             { value: "vía", name: "Vía Vía" },
//             { value: "carretera", name: "Carretera carret." },
//             { value: "glorieta", name: "Glorieta gta." },
//             { value: "interior", name: "Interior int." },
//             { value: "plaza", name: "Plaza plza." },
//             { value: "bulevar", name: "Bulevar Blvd." }
//         ];
//
//         this.list.innerHTML = '';
//         streetTypes.forEach(item => {
//             const option = document.createElement('li');
//             option.classList.add('custom-select-item');
//             option.dataset.value = item.value;
//             option.textContent = item.name;
//             option.addEventListener('click', () => this.selectItem(item));
//             this.list.appendChild(option);
//         });
//
//         this.input.readOnly = true;
//         this.input.removeEventListener('input', this.validate);
//     }
//
//     selectItem(item) {
//         this.input.value = item.name;
//         this.input.dataset.value = item.value;
//         this.selectWrapper.classList.remove('open');
//         this.updateMainData(this.type, item.value);
//         this.checkFormValidity();
//     }
// }

async function loadCities() {
    const citySelect = new CustomSelect(document.querySelector('.form__select--city'), 'city');
    // const cities = await citySelect.loadData('data/cities/cities.json');
    const cities = await citySelect.loadData('data/cities.json');
    citySelect.createSelect(cities);
}

document.addEventListener("DOMContentLoaded", () => {
    loadCities();

    const submitButton = document.querySelector('.form__btn');
    if (submitButton) {
        submitButton.disabled = true;
    }

    // const selectFromArray = document.querySelector('.form__select--street');
    // if (selectFromArray) {
    //     new SelectFromArray(selectFromArray);
    // }
});