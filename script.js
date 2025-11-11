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
					<button class="btn secondary delRowBtn" type="button">X</button>
				</td>
			`;

			tr.querySelector('.delRowBtn').addEventListener('click', () => {
				tr.remove();
			});

			tbody.appendChild(tr);
		}

		addBtn.addEventListener('click', addDeliveryRow);

		return container;
	}

	// Main function: add request row + dropdown
	function addRequestRow() {
	const currentTime = getCurrentTimeStr();

	const tr = document.createElement('tr');
	tr.innerHTML = `
		<td>
			<button class="play-btn" type="button">▶</button>
			<span class="request-time">${currentTime}</span>
		</td>
		<td contenteditable="true"></td>
		<td contenteditable="true" style="width:60px;text-align:center"></td>
		<td contenteditable="true"></td>
		<td contenteditable="true"></td>
		<td contenteditable="true"></td>
		<td contenteditable="true" style="width:70px;"></td>
		<td contenteditable="true"></td>
		<td><button class="delete-btn" type="button">✕</button></td>
		<td class="checkbox-col">
			<button class="done-btn btn" type="button">Done</button>
		</td>
	`;

	tr.querySelector('.request-time').contentEditable = "false";

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
		const cells = tr.querySelectorAll('td');

		arrivalRow.innerHTML = `
			<td contenteditable="true">${cells[0].querySelector('.request-time').textContent}</td>
			<td contenteditable="true">${cells[1].textContent}</td>
			<td contenteditable="true">${cells[2].textContent}</td>
			<td contenteditable="true">${cells[3].textContent}</td>
			<td contenteditable="true">${cells[4].textContent}</td>
			<td contenteditable="true">${cells[5].textContent}</td>
			<td contenteditable="true">${cells[6].textContent}</td>
			<td><button class="delete-btn" type="button">✕</button></td>
		`;

		arrivalRow.querySelectorAll('td').forEach(td => td.style.whiteSpace = "normal");

		const partialTbody = dropdown.querySelector('tbody');
		const partialRows = partialTbody.querySelectorAll('tr');

		if (partialRows.length) {
			const partialContainer = document.createElement('tr');
			const colspan = 9;
			partialContainer.innerHTML = `<td colspan="${colspan}" style="padding:0;"></td>`;
			const td = partialContainer.querySelector('td');

			const innerTable = document.createElement('table');
			innerTable.style.width = '100%';
			innerTable.style.borderCollapse = 'collapse';
			innerTable.style.tableLayout = 'fixed';
			innerTable.style.fontSize = '0.9em';
			innerTable.style.margin = '0';
			innerTable.style.padding = '0';

			// Column widths match main table
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
				if (delBtn) {
					delBtn.addEventListener('click', () => clone.remove());
				}
				innerTbody.appendChild(clone);
			});

			innerTable.appendChild(innerTbody);
			td.appendChild(innerTable);

			arrivalTableBody.appendChild(arrivalRow);
			arrivalTableBody.appendChild(partialContainer);
		} else {
			arrivalTableBody.appendChild(arrivalRow);
		}

		const delBtn = arrivalRow.querySelector('.delete-btn');
		if (delBtn) {
			delBtn.addEventListener('click', () => {
				arrivalRow.remove();
			});
		}

		tr.remove();
		dropdown.remove();
	});

		requestTableBody.appendChild(tr);
		requestTableBody.appendChild(dropdown);
	}


	addRowBtn.addEventListener('click', addRequestRow);
});
