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

		//Function to add a partial delivery row
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
			<th>
				<button class="play-btn" type="button">▶</button>
				<span class="request-time">${currentTime}</span>
			</th>
			<th contenteditable="true"></th>
			<th contenteditable="true" style="width:60px;text-align:center"></th>
			<th contenteditable="true"></th>
			<th contenteditable="true"></th>
			<th contenteditable="true"></th>
			<th contenteditable="true" style="width:70px;"></th>
			<th contenteditable="true"></th>
			<th><button class="delete-btn" type="button">✕</button></th>
			<th class="checkbox-col">
				<button class="done-btn btn" type="button">Done</button>
			</th>
		`;

		tr.querySelector('.request-time').contentEditable = "false";

		const dropdown = createPartialDeliveriesContainer();

		// Delete request row + dropdown
		tr.querySelector('.delete-btn').addEventListener('click', () => {
			tr.remove();
			dropdown.remove();
		});

		// Toggle dropdown
		const toggleBtn = tr.querySelector('.play-btn');
		toggleBtn.addEventListener('click', () => {
			const hidden = dropdown.style.display === "none";
			dropdown.style.display = hidden ? "table-row" : "none";
			toggleBtn.textContent = hidden ? "▼" : "▶";
		});

		// Done button: move row + partial deliveries to Arrival Table
		tr.querySelector('.done-btn').addEventListener('click', () => {
			const arrivalRow = document.createElement('tr');

			// Copy main cells from request row
			const cells = tr.querySelectorAll('th, td');
			arrivalRow.innerHTML = `
				<td>${cells[0].querySelector('.request-time').textContent}</td>
				<td contenteditable="true">${cells[1].textContent}</td>
				<td contenteditable="true">${cells[2].textContent}</td>
				<td contenteditable="true">${cells[3].textContent}</td>
				<td contenteditable="true">${cells[4].textContent}</td>
				<td contenteditable="true">${cells[5].textContent}</td>
				<td contenteditable="true">${cells[6].textContent}</td>
				<td><button class="delete-btn" type="button">✕</button></td>
				<td>${getCurrentTimeStr()}</td>
			`;

			// Copy partial deliveries (if any)
			const partialTbody = dropdown.querySelector('tbody');
			const partialRows = partialTbody.querySelectorAll('tr');
			if (partialRows.length) {
				const partialContainer = document.createElement('tr');
				const colspan = 9;
				const innerTable = document.createElement('table');
				innerTable.style.width = '100%';
				innerTable.style.borderCollapse = 'collapse';

				const innerTbody = document.createElement('tbody');
				partialRows.forEach(pr => {
					const clone = pr.cloneNode(true);
					clone.querySelectorAll('[contenteditable]').forEach(td => td.setAttribute('contenteditable','false'));
					innerTbody.appendChild(clone);
				});

				innerTable.appendChild(innerTbody);
				const td = document.createElement('td');
				td.colSpan = colspan;
				td.appendChild(innerTable);
				partialContainer.appendChild(td);
				arrivalTableBody.appendChild(partialContainer);
			}

			// Delete button for main row in Arrival Table
			arrivalRow.querySelector('.delete-btn').addEventListener('click', () => arrivalRow.remove());

			arrivalTableBody.appendChild(arrivalRow);

			// Remove request row + dropdown
			tr.remove();
			dropdown.remove();
		});

		requestTableBody.appendChild(tr);
		requestTableBody.appendChild(dropdown);
	}

	addRowBtn.addEventListener('click', addRequestRow);
});
