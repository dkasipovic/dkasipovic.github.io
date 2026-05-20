const MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const currentYear = new Date().getFullYear();
const today = new Date();

const daySelect = document.getElementById('daySelect');
const monthSelect = document.getElementById('monthSelect');
const calBody = document.getElementById('calBody');

function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function isValidDate(year, month, day) {
    if (month === 2 && day === 29 && !isLeapYear(year)) return false;
    return true;
}

function getMondayOfWeek(year, month, day) {
    const date = new Date(year, month - 1, day);
    const dow = date.getDay();
    const offset = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(date);
    monday.setDate(monday.getDate() + offset);
    return monday;
}

function formatCell(date) {
    return `${date.getDate()}. ${MONTHS[date.getMonth()]}`;
}

function buildTable(day, month) {
    calBody.innerHTML = '';
    let currentYearRow = null;

    for (let year = currentYear - 15; year <= currentYear + 15; year++) {
        const tr = document.createElement('tr');
        if (year === currentYear) {
            tr.className = 'current-year';
            currentYearRow = tr;
        }

        const yearCell = document.createElement('td');
        yearCell.className = 'year-cell';
        yearCell.textContent = year;
        tr.appendChild(yearCell);

        if (!isValidDate(year, month, day)) {
            for (let i = 0; i < 7; i++) {
                const td = document.createElement('td');
                td.className = 'invalid' + (i >= 5 ? ' weekend-col' : '');
                td.textContent = '—';
                tr.appendChild(td);
            }
        } else {
            const monday = getMondayOfWeek(year, month, day);
            for (let i = 0; i < 7; i++) {
                const d = new Date(monday);
                d.setDate(d.getDate() + i);
                const td = document.createElement('td');

                const cellDay = d.getDate();
                const cellMonth = d.getMonth() + 1;

                const isSelected = cellDay === day && cellMonth === month;
                const isOtherMonth = cellMonth !== month;
                const isWeekend = i >= 5;

                let cls = '';
                if (isSelected) cls += ' selected';
                if (isOtherMonth && !isSelected) cls += ' other-month';
                if (isWeekend && !isSelected) cls += ' weekend-col';
                td.className = cls.trim();
                td.textContent = formatCell(d);
                tr.appendChild(td);
            }
        }

        calBody.appendChild(tr);
    }

    if (currentYearRow) {
        currentYearRow.scrollIntoView({ block: 'center', behavior: 'instant' });
    }
}

function populateSelects() {
    for (let d = 1; d <= 31; d++) {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = d;
        daySelect.appendChild(opt);
    }

    MONTHS.forEach((name, i) => {
        const opt = document.createElement('option');
        opt.value = i + 1;
        opt.textContent = name;
        monthSelect.appendChild(opt);
    });

    daySelect.value = today.getDate();
    monthSelect.value = today.getMonth() + 1;
}

function updateMaxDay() {
    const month = parseInt(monthSelect.value, 10);
    const maxDay = DAYS_IN_MONTH[month - 1];
    const currentDay = parseInt(daySelect.value, 10);

    Array.from(daySelect.options).forEach((opt) => {
        opt.disabled = parseInt(opt.value, 10) > maxDay;
    });

    if (currentDay > maxDay) {
        daySelect.value = maxDay;
    }
}

function onPickerChange() {
    updateMaxDay();
    const day = parseInt(daySelect.value, 10);
    const month = parseInt(monthSelect.value, 10);
    buildTable(day, month);
}

populateSelects();
updateMaxDay();
buildTable(today.getDate(), today.getMonth() + 1);

daySelect.addEventListener('change', onPickerChange);
monthSelect.addEventListener('change', onPickerChange);

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js');
}
