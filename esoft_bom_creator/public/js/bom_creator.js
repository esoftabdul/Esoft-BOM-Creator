frappe.ui.form.on("BOM Creator", {
	refresh: async function (frm) {
		set_defaults(frm);
	},
	custom_customer: function (frm) {
		map_summary_tables(frm);
	},
});

frappe.ui.form.on("BOM Creator Item", {
	items_add: async (frm, cdt, cdn) => {
		await init_row(frm, cdt, cdn);
	},
	item_code: async (frm, cdt, cdn) => {
		await init_row(frm, cdt, cdn);
	},
	custom_length: (frm, cdt, cdn) => {
		recalc_row(frm, cdt, cdn);
		set_length_range(cdt, cdn);
	},
	custom_width: (frm, cdt, cdn) => {
		recalc_row(frm, cdt, cdn);
	},
	custom_thickness: (frm, cdt, cdn) => {
		recalc_row(frm, cdt, cdn);
		set_thickness_range(cdt, cdn);
	},
	qty: (frm, cdt, cdn) => {
		recalc_row(frm, cdt, cdn);
		update_summary_for_row(frm, cdt, cdn);
	},
	custom_blwt: (frm, cdt, cdn) => {
		handle_item_change(frm, cdt, cdn);
	},
	custom_area_sqft: (frm, cdt, cdn) => {
		handle_item_change(frm, cdt, cdn);
		update_summary_for_row(frm, cdt, cdn);
	},
	custom_add_operation: (frm, cdt, cdn) => {
		open_operation_dialog(frm, cdt, cdn);
	},
});

frappe.ui.form.on("BOM Hardware Costing", {
	hs_unit_price: function (frm, cdt, cdn) {
		hardware_price_change(frm, cdt, cdn);
	},
});

function set_defaults(frm) {
	// update_full_summary(frm)   Only use if want to populate summary table for old docs
	set_summary_cache(frm);
	set_operation_list(frm);
	set_groups_cache(frm);
}

async function fetch_hardware_item_groups() {
	const res = await frappe.db.get_list("Item Group", {
		filters: { custom_is_hardware_and_bo_group: 1 },
		pluck: "name",
		limit: 200,
	});
	return res;
}

async function init_row(frm, cdt, cdn) {
	const row = locals[cdt][cdn];
	if (!row.item_code) return;

	const [item, item_grp] = await Promise.all([
		frappe.db.get_value("Item", row.item_code, [
			"custom_length",
			"custom_width",
			"custom_thickness",
		]),
		frappe.db.get_value("Item Group", row.item_group, ["custom_density"]),
	]);

	const item_data = item.message || {};
	const group_data = item_grp.message || {};

	const length = parseFloat(item_data.custom_length) || 0;
	const width = parseFloat(item_data.custom_width) || 0;
	const thickness = parseFloat(item_data.custom_thickness) || 0;
	const density = parseFloat(group_data.custom_density) || 0;
	frappe.model.set_value(cdt, cdn, "custom_length", length);
	frappe.model.set_value(cdt, cdn, "custom_width", width);
	frappe.model.set_value(cdt, cdn, "custom_thickness", thickness);

	frappe.model.set_value(cdt, cdn, "custom_density", density);

	recalc_row(frm, cdt, cdn);

	frm.refresh_field("items");
}

async function recalc_row(frm, cdt, cdn) {
	const row = locals[cdt][cdn];
	const { custom_length: l, custom_width: w, custom_thickness: t, qty } = row;

	if (!row.custom_density) {
		const res = await frappe.db.get_value("Item Group", row.item_group, ["custom_density"]);
		const d = parseFloat((res.message || {}).custom_density) || 0;
		frappe.model.set_value(cdt, cdn, "custom_density", d);
	}

	const blwt = calculate_blank_weight(l, w, t, qty, row.custom_density);
	const area = calculate_area_sq_ft(l, w, qty);

	frappe.model.set_value(cdt, cdn, "custom_blwt", blwt);
	frappe.model.set_value(cdt, cdn, "custom_area_sqft", area);
}

function calculate_area_sq_ft(length, width, qty) {
	if (length && width && qty) {
		const area = (length * width * qty * 2) / 92903.04;
		return parseFloat(area.toFixed(3));
	}
	return 0.0;
}

function calculate_blank_weight(length, width, thickness, qty, density) {
	if (length && width && thickness && qty && density) {
		const weight = (length * width * thickness * qty * density) / 1000000;
		return parseFloat(weight.toFixed(3));
	}
}

function set_length_range(cdt, cdn) {
	const row = locals[cdt][cdn];
	const length_range = row.custom_length > 3000 ? "Above 3 Mtrs" : "Till 3 Mtrs";
	frappe.model.set_value(cdt, cdn, "custom_range", length_range);
}

function set_thickness_range(cdt, cdn) {
	const row = locals[cdt][cdn];
	const thickness_range = row.custom_thickness > 3 ? "Above 3 MM" : "Till 3 MM";
	frappe.model.set_value(cdt, cdn, "custom_rangethickness", thickness_range);
}

async function set_summary_cache(frm) {
	frm.summary_cache = new Map();
	frm.item_contributions = new Map();
	if (!frm.doc.custom_summary || frm.doc.custom_summary.length === 0) {
		update_full_summary(frm);
	} else {
		frm.doc.custom_summary.forEach((row) => {
			const key = `${row.ig}|${row.rt}|${row.rl}`;
			frm.summary_cache.set(key, {
				ig: row.ig,
				rt: row.rt,
				rl: row.rl,
				bw: parseFloat(row.bw) || 0,
				ar: parseFloat(row.ar) || 0,
			});
		});
	}
}

async function set_groups_cache(frm) {
	frm.hw_groups = await fetch_hardware_item_groups();
	frm.powder_groups = await get_powder_groups();
}

async function handle_item_change(frm, cdt, cdn) {
	const item = locals[cdt][cdn];

	if (!item.custom_material) return;

	const old_values = item.old_values || {};
	const new_values = {
		material: item.custom_material,
		thickness: item.custom_rangethickness,
		range: item.custom_range,
		blwt: item.custom_blwt,
		area: item.custom_area_sqft,
	};

	if (old_values.material) {
		const old_key = `${old_values.material}|${old_values.thickness}|${old_values.range}`;
		if (frm.summary_cache.has(old_key)) {
			const summary_entry = frm.summary_cache.get(old_key);
			summary_entry.bw -= parseFloat(old_values.blwt) || 0;
			summary_entry.ar -= parseFloat(old_values.area) || 0;
			if (summary_entry.bw === 0 && summary_entry.ar === 0) {
				frm.summary_cache.delete(old_key);
			}
		}
	}

	const new_key = `${new_values.material}|${new_values.thickness}|${new_values.range}`;
	if (!frm.summary_cache.has(new_key)) {
		frm.summary_cache.set(new_key, {
			ig: new_values.material,
			rt: new_values.thickness,
			rl: new_values.range,
			bw: 0,
			ar: 0,
		});
	}
	const summary_entry = frm.summary_cache.get(new_key);
	summary_entry.bw += parseFloat(new_values.blwt) || 0;
	summary_entry.ar += parseFloat(new_values.area) || 0;

	update_summary_table(frm);

	item.old_values = { ...new_values };
}

function update_summary_table(frm) {
	const summary_array = Array.from(frm.summary_cache.values())
		.map((entry) => ({
			ig: entry.ig,
			rt: entry.rt,
			rl: entry.rl,
			bw: parseFloat(entry.bw.toFixed(3)),
			ar: parseFloat(entry.ar.toFixed(3)),
		}))
		.sort(
			(a, b) =>
				a.ig.localeCompare(b.ig) || a.rt.localeCompare(b.rt) || a.rl.localeCompare(b.rl)
		);

	frm.set_value("custom_summary", summary_array);
	frm.refresh_field("custom_summary");
}

function update_full_summary(frm) {
	frm.summary_cache.clear();
	frm.doc.items.forEach((item) => {
		if (!item.custom_material) return;

		const key = `${item.custom_material}|${item.custom_rangethickness}|${item.custom_range}`;

		if (!frm.summary_cache.has(key)) {
			frm.summary_cache.set(key, {
				ig: item.custom_material,
				rt: item.custom_rangethickness,
				rl: item.custom_range,
				bw: 0,
				ar: 0,
			});
		}
		const entry = frm.summary_cache.get(key);
		entry.bw += parseFloat(item.custom_blwt) || 0;
		entry.ar += parseFloat(item.custom_area_sqft) || 0;
		item.old_values = {
			material: item.custom_material,
			thickness: item.custom_rangethickness,
			range: item.custom_range,
			blwt: item.custom_blwt,
			area: item.custom_area_sqft,
		};
	});
	update_summary_table(frm);
}

async function set_operation_list(frm) {
	if (!frm.operations_list) {
		frm.operations_list = await frappe.db.get_list("Operation", {
			filters: {
				custom_is_valid_for_costing: 1,
			},
			limit: 50,
		});
	}
}

function open_operation_dialog(frm, cdt, cdn) {
	const dialog = new frappe.ui.Dialog({
		title: "Select Operations",
		fields: [
			{
				fieldtype: "Table",
				fieldname: "selected_operations",
				label: __("Operations"),
				reqd: 1,
				cannot_add_rows: true,
				cannot_delete_rows: true,
				in_place_edit: true,
				fields: [
					{
						fieldname: "operation",
						fieldtype: "Data",
						label: __("Operation"),
						in_list_view: true,
						read_only: true,
					},
				],
			},
		],
		primary_action_label: __("Save"),
		primary_action(values) {
			handle_selected_operations(dialog, cdt, cdn);
			dialog.hide();
		},
	});
	populate_operations_data(dialog, frm, cdt, cdn);
	dialog.show();
}

function handle_selected_operations(dialog, cdt, cdn) {
	const row = locals[cdt][cdn];
	const selected_rows = dialog.fields_dict.selected_operations.grid.get_selected_children();
	const selected_ops = selected_rows
		.map((row) => row.operation)
		.filter(Boolean)
		.join(", ");

	frappe.model.set_value(cdt, cdn, "custom_msf", selected_ops);
}

async function populate_operations_data(dialog, frm, cdt, cdn) {
	const row = locals[cdt][cdn];
	const table = dialog.fields_dict.selected_operations;
	table.df.data = [];

	const selected_ops = (row.custom_msf || "")
		.split(",")
		.map((op) => op.trim())
		.filter(Boolean);

	set_operation_list(frm);

	frm.operations_list.map((operation) => {
		table.df.data.push({
			operation: operation.name,
			__checked: selected_ops.includes(operation.name),
		});
	});

	table.grid.refresh();
}

async function map_summary_tables(frm) {
	const cust_price = await fetch_customer_pricing(frm);
	const today = frappe.datetime.get_today();

	const { hardware_agg, powder_agg } = aggregate_items(
		frm.doc.items,
		frm.hw_groups,
		frm.powder_groups
	);

	rebuild_hardware_summary(frm, hardware_agg, cust_price, today);
	rebuild_powder_summary(frm, powder_agg);

	frm.refresh_field("custom_hardware_summary");
	frm.refresh_field("custom_powder_coating_summary");
}

function update_summary_for_row(frm, cdt, cdn) {
	const row = locals[cdt][cdn];

	const d_qty = (parseFloat(row.qty) || 0) - (row._original_qty || 0);
	const d_area = (parseFloat(row.custom_area_sqft) || 0) - (row._original_area || 0);

	row._original_qty = parseFloat(row.qty) || 0;
	row._original_area = parseFloat(row.custom_area_sqft) || 0;

	if (frm.hw_groups.includes(row.item_group)) {
		adjust_hardware_row(frm, row, d_qty);
		recalc_hardware_totals(frm);
	} else if (frm.powder_groups.includes(row.item_group)) {
		adjust_powder_row(frm, row, d_area);
		recalc_powder_totals(frm);
	}

	frm.refresh_field("custom_hardware_summary");
	frm.refresh_field("custom_powder_coating_summary");
}

function aggregate_items(items = [], hw_groups, powder_groups) {
	const hardware_agg = {};
	const powder_agg = {};

	items.forEach((r) => {
		const qty = parseFloat(r.qty) || 0;
		const area = parseFloat(r.custom_area_sqft) || 0;

		if (hw_groups.includes(r.item_group)) {
			hardware_agg[r.item_code] = hardware_agg[r.item_code] || {
				item_code: r.item_code,
				qty: 0,
			};
			hardware_agg[r.item_code].qty += qty;
		} else if (powder_groups.includes(r.item_group)) {
			const key = `${r.item_group}|${r.custom_range}`;
			powder_agg[key] = powder_agg[key] || {
				item_group: r.item_group,
				range: r.custom_range,
				area: 0,
			};
			powder_agg[key].area += area;
		}
	});

	return { hardware_agg, powder_agg };
}

function rebuild_hardware_summary(frm, hardware_agg, cust_price, today) {
	frm.clear_table("custom_hardware_summary");

	let total_qty = 0;
	let total_amt = 0;

	Object.values(hardware_agg).forEach((o) => {
		const price_row = (cust_price.items || []).find(
			(it) =>
				it.item === o.item_code &&
				(!it.valid_from || it.valid_from <= today) &&
				(!it.valid_till || it.valid_till >= today)
		);

		const unit_price = price_row ? price_row.rate : 0;
		const total_cost = o.qty * unit_price;

		const row = frm.add_child("custom_hardware_summary");
		row.hs_item_name = o.item_code;
		row.hs_qty = o.qty;
		row.hs_unit_price = unit_price;
		row.hs_total_cost = total_cost;

		total_qty += o.qty;
		total_amt += total_cost;
	});

	const tot = frm.add_child("custom_hardware_summary");
	tot.hs_item_name = "Total";
	tot.hs_qty = total_qty;
	tot.hs_unit_price = null;
	tot.hs_total_cost = total_amt;
}

function rebuild_powder_summary(frm, powder_agg) {
	frm.clear_table("custom_powder_coating_summary");

	let total_area = 0;

	Object.values(powder_agg).forEach((o) => {
		const row = frm.add_child("custom_powder_coating_summary");
		row.item_group = o.item_group;
		row.range = o.range;
		row.area = o.area;

		total_area += o.area;
	});

	const tot = frm.add_child("custom_powder_coating_summary");
	tot.item_group = "Total";
	tot.range = "";
	tot.area = total_area;
}

function adjust_hardware_row(frm, item_row, d_qty) {
	const summary = frm.doc.custom_hardware_summary || [];
	const idx = summary.findIndex((r) => r.hs_item_name === item_row.item_code);
	if (idx === -1) return;

	const srow = summary[idx];
	const new_qty = (parseFloat(srow.hs_qty) || 0) + d_qty;
	const new_cost = new_qty * (parseFloat(srow.hs_unit_price) || 0);

	frappe.model.set_value(srow.doctype, srow.name, "hs_qty", new_qty);
	frappe.model.set_value(srow.doctype, srow.name, "hs_total_cost", new_cost);
}

function adjust_powder_row(frm, item_row, d_area) {
	const summary = frm.doc.custom_powder_coating_summary || [];
	const idx = summary.findIndex(
		(r) => r.item_group === item_row.item_group && r.range === item_row.custom_range
	);
	if (idx === -1) return;

	const srow = summary[idx];
	const new_area = (parseFloat(srow.area) || 0) + d_area;

	frappe.model.set_value(srow.doctype, srow.name, "area", new_area);
}

function recalc_hardware_totals(frm) {
	let t_qty = 0,
		t_amt = 0;
	(frm.doc.custom_hardware_summary || []).forEach((r) => {
		if (r.hs_item_name !== "Total") {
			t_qty += parseFloat(r.hs_qty) || 0;
			t_amt += parseFloat(r.hs_total_cost) || 0;
		}
	});

	const total_row = frm.doc.custom_hardware_summary.slice(-1)[0];
	if (total_row) {
		frappe.model.set_value(total_row.doctype, total_row.name, "hs_qty", t_qty);
		frappe.model.set_value(total_row.doctype, total_row.name, "hs_total_cost", t_amt);
	}
}

function recalc_powder_totals(frm) {
	let t_area = 0;
	(frm.doc.custom_powder_coating_summary || []).forEach((r) => {
		if (r.item_group !== "Total") {
			t_area += parseFloat(r.area) || 0;
		}
	});
	const total_row = frm.doc.custom_powder_coating_summary.slice(-1)[0];
	if (total_row) {
		frappe.model.set_value(total_row.doctype, total_row.name, "area", t_area);
	}
}

async function fetch_customer_pricing(frm) {
	try {
		return await frappe.db.get_doc("Customer Item Group Wise Price", frm.doc.custom_customer);
	} catch (error) {
		frappe.throw("The price list for the selected customer is not available.");
	}
}

async function get_powder_groups() {
	const res = await frappe.call({
		method: "frappe.desk.treeview.get_all_nodes",
		args: {
			doctype: "Item Group",
			label: "POWDER",
			parent: "POWDER",
			tree_method: "frappe.desk.treeview.get_children",
		},
	});

	return res.message ? cleanHierarchicalJson(res.message, "POWDER") : [];
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

async function hardware_price_change(frm, cdt, cdn) {
	let row = locals[cdt][cdn];
	let totalcost = parseFloat(row.hs_unit_price) * parseFloat(row.hs_qty);
	frappe.model.set_value(cdt, cdn, "hs_total_cost", totalcost);
	recalc_hardware_totals(frm);
}
