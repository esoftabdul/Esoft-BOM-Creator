// Copyright (c) 2025, Abdul and contributors
// For license information, please see license.txt

frappe.ui.form.on("Customer Item Group Wise Price", {
	refresh: function (frm) {
		load_defaults(frm);
	},
});

frappe.ui.form.on("Customer Item Group Other Pricing", {
	type: function (frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		let options = ["Select an option"];

		if (row.type === "Operation Charges") {
			options = options.concat(frm.operations_list || []);
		} else if (row.type === "Raw Material") {
			options = options.concat(frm.rm_groups || []);
		}
		console.log("New options for selected_item:", options);

		const grid = frm.get_field("hardware_and_bo_summary");

		grid.grid.update_docfield_property("selected_item", "options", options.join("\n"));

		grid.grid.refresh();
	},
});

function load_defaults(frm) {
	load_rm_groups(frm);
	load_operations(frm);
	load_operations_master(frm);
}

async function load_operations_master(frm) {
	const operation_master_list = await frappe.db.get_list("Operation Charges Master", {
		fields: ["cm_charges_name"],
	});
	frm.operations_list = [
		...(frm.operations_list || []),
		...(operation_master_list || []).map((child) => child.cm_charges_name),
	];
}

// async function load_rm_groups(frm) {
// 	const res = await frappe.call({
// 		method: "frappe.desk.treeview.get_children",
// 		args: {
// 			doctype: "Item Group",
// 			parent: "RM",
// 		},
// 	});

// 	frm.rm_groups = (res.message || []).map((child) => child.value);
// }

async function load_rm_groups(frm) {
	const res = await frappe.call({
		method: "frappe.desk.treeview.get_all_nodes",
		args: {
			doctype: "Item Group",
			label: "RM",
			parent: "RM",
			tree_method: "frappe.desk.treeview.get_children",
		},
	});

	frm.rm_groups = res.message ? cleanHierarchicalJson(res.message, "RM") : [];
}
function cleanHierarchicalJson(data, root) {
	const dataMap = {};
	data.forEach((entry) => {
		dataMap[entry.parent] = entry.data;
	});

	function collectItems(parentKey) {
		const collected = [];
		const children = dataMap[parentKey] || [];

		children.forEach((item) => {
			collected.push(item.value);
			if (item.expandable) {
				collected.push(...collectItems(item.value));
			}
		});

		return collected;
	}
	return collectItems(root);
}
async function load_operations(frm) {
	const operations_list = await frappe.db.get_list("Operation", {
		filters: {
			custom_is_valid_for_costing: 1,
		},
	});
	frm.operations_list = (operations_list || []).map((child) => child.name);
}
