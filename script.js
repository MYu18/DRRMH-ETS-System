document.addEventListener('DOMContentLoaded', () => {
	const requestTableBody = document.querySelector('#requestTable tbody');
	const arrivalTableBody = document.querySelector('#arrivalTable tbody');
	const addRowBtn = document.getElementById('addRowBtn');

	// Utility: returns HH:MM current time
	function getCurrentTimeStr() {
		const now = new Date();
		const hh = String(now.getHours()).padStart(2, '0');
		const mm = String(now.getMinutes()).padStart(2, '0');
		return `${hh}:${mm}`;
	}

	// Create Partial Deliveries Container
	function createPartialDeliveriesContainer() {
		const container = document.createElement('tr');
		container.classList.add('partial-container');
		container.style.display = 'none';

		container.innerHTML = `
			<td colspan="10" style="padding: 10px 5px; border-top: 1px dashed #ddd;">
				<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
					<strong>Partial Deliveries</strong>
					<div>
						<button class="btn secondary addDeliveryBtn" type="button">Add Delivery</button>
					</div>
				</div>
				<table class="partialTable" style="width:100%;border-collapse:collapse;">
					<thead>
						<tr>
							<th style="width:120px">Time</th>
							<th>Quantity / Notes</th>
							<th style="width:160px">Remarks</th>
							<th style="width:60px">Delete</th>
						</tr>
					</thead>
					<tbody></tbody>
				</table>
			</td>
		`;

		const tbody = container.querySelector('tbody');
		const addBtn = container.querySelector('.addDeliveryBtn');

		function addDeliveryRow() {
			const tr = document.createElement('tr');

			tr.innerHTML = `
				<td contenteditable="true" class="delTime">${getCurrentTimeStr()}</td>
				<td contenteditable="true" class="delQty"></td>
				<td contenteditable="true" class="delRemarks"></td>
				<td style="text-align:center">
					<button type="button" class="delRowBtn btn">✕</button>
				</td>
			`;

			tr.querySelector('.delRowBtn').addEventListener('click', () => tr.remove());

			tbody.appendChild(tr);
		}

		addBtn.addEventListener('click', addDeliveryRow);

		return container;
	}

	function addRequestRow() {
		const currentTime = getCurrentTimeStr();

		const tr = document.createElement('tr');
		tr.innerHTML = `
			<td>
				<button class="play-btn btn" type="button">▶</button>
				<span class="request-time">${currentTime}</span>
			</td>
			<td contenteditable="true"></td>
			<td contenteditable="true"></td>
			<td contenteditable="true"></td>
			<td contenteditable="true"></td>
			<td contenteditable="true"></td>
			<td contenteditable="true" class="est-min"></td>
			<td contenteditable="true" class="eta"></td>
			<td><button type="button" class="delete-btn btn">✕</button></td>
			<td class="checkbox-col">
				<button type="button" class="done-btn btn">✔</button>
			</td>
		`;

		tr.querySelector('.request-time').contentEditable = "false";

		const estCell = tr.querySelector('.est-min');
		const etaCell = tr.querySelector('.eta');

		function addMinutesToTime(timeStr, minutesToAdd) {
			const [hh, mm] = timeStr.split(':').map(Number);
			const date = new Date();
			date.setHours(hh);
			date.setMinutes(mm + Number(minutesToAdd));
			return `${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
		}

		function minutesDiffFromNow(timeStr) {
			const now = new Date();
			const [hh, mm] = timeStr.split(':').map(Number);
			const target = new Date();
			target.setHours(hh);
			target.setMinutes(mm);
			let diffMs = target - now;
			if (diffMs < 0) diffMs += 24*60*60*1000;
			return Math.round(diffMs / 60000);
		}

		// Two-way binding
		estCell.addEventListener('input', () => {
			const val = estCell.textContent.trim();
			if (!val || isNaN(val)) return;
			etaCell.textContent = addMinutesToTime(currentTime, val);
		});

		etaCell.addEventListener('input', () => {
			const val = etaCell.textContent.trim();
			if (!val) return;
			estCell.textContent = minutesDiffFromNow(val);
		});

		const dropdown = createPartialDeliveriesContainer();

		tr.querySelector('.delete-btn').addEventListener('click', () => {
			tr.remove();
			dropdown.remove();
		});

		const toggleBtn = tr.querySelector('.play-btn');
		toggleBtn.addEventListener('click', () => {
			const hidden = dropdown.style.display === "none";
			dropdown.style.display = hidden ? "table-row" : "none";
			toggleBtn.textContent = hidden ? "▼" : "▶";
		});

		tr.querySelector('.done-btn').addEventListener('click', () => {
			const arrivalRow = document.createElement('tr');

			arrivalRow.innerHTML = `
				<td contenteditable="true">${tr.querySelector('.request-time').textContent}</td>
				<td contenteditable="true">${tr.children[1].textContent}</td>
				<td contenteditable="true">${tr.children[2].textContent}</td>
				<td contenteditable="true">${tr.children[3].textContent}</td>
				<td contenteditable="true">${tr.children[4].textContent}</td>
				<td contenteditable="true">${tr.children[5].textContent}</td>
				<td contenteditable="true">${etaCell.textContent}</td>
				<td><button type="button" class="delete-btn btn">✕</button></td>
			`;

			arrivalRow.querySelectorAll('td').forEach(td => td.style.whiteSpace = "normal");

			const partialTbody = dropdown.querySelector('tbody');
			const partialRows = partialTbody.querySelectorAll('tr');

			if (partialRows.length) {
				const partialContainer = document.createElement('tr');
				const colspan = 8;
				partialContainer.innerHTML = `<td colspan="${colspan}" style="padding:0;"></td>`;
				const td = partialContainer.querySelector('td');

				const innerTable = document.createElement('table');
				innerTable.style.width = '100%';
				innerTable.style.borderCollapse = 'collapse';
				innerTable.style.tableLayout = 'fixed';
				innerTable.style.fontSize = '0.9em';
				innerTable.style.margin = '0';
				innerTable.style.padding = '0';

				// Add header for nested partial deliveries table
				const thead = document.createElement('thead');
				thead.innerHTML = `
					<tr>
						<th style="width:120px; border-bottom: 1px solid #ccc;">Time</th>
						<th style="border-bottom: 1px solid #ccc;">Quantity / Notes</th>
						<th style="width:160px; border-bottom: 1px solid #ccc;">Remarks</th>
						<th style="width:60px; border-bottom: 1px solid #ccc;">Delete</th>
					</tr>
				`;
				innerTable.appendChild(thead);

				const colgroup = document.createElement('colgroup');
				colgroup.innerHTML = `
					<col style="width:120px">
					<col>
					<col style="width:160px">
					<col style="width:60px">
				`;
				innerTable.appendChild(colgroup);

				const innerTbody = document.createElement('tbody');

				partialRows.forEach(pr => {
					const clone = pr.cloneNode(true);
					clone.querySelectorAll('[contenteditable]').forEach(td => td.setAttribute('contenteditable','true'));
					const delBtn = clone.querySelector('.delRowBtn');
					if (delBtn) delBtn.addEventListener('click', () => clone.remove());
					innerTbody.appendChild(clone);
				});

				innerTable.appendChild(innerTbody);
				td.appendChild(innerTable);
				arrivalTableBody.appendChild(arrivalRow);
				arrivalTableBody.appendChild(partialContainer);
			} else {
				arrivalTableBody.appendChild(arrivalRow);
			}


			// Attach delete listener for main arrival row
			arrivalRow.querySelector('.delete-btn').addEventListener('click', () => arrivalRow.remove());

			tr.remove();
			dropdown.remove();
		});

		requestTableBody.appendChild(tr);
		requestTableBody.appendChild(dropdown);
	}

	addRowBtn.addEventListener('click', addRequestRow);
});
