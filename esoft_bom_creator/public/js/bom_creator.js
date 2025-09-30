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

frappe.ui.form.on("BOM Material Summary", {
	bw: async function (frm, cdt, cdn) {
		const summary_item = locals[cdt][cdn];
		await update_costing_summary_row(frm, summary_item);
		update_costing_operation_rows(frm);
	},
	ar: async function (frm, cdt, cdn) {
		const summary_item = locals[cdt][cdn];
		await update_costing_summary_row(frm, summary_item);
		update_costing_operation_rows(frm);
	},
});

frappe.ui.form.on("BOM Hardware Costing", {
	hs_unit_price: function (frm, cdt, cdn) {
		hardware_price_change(frm, cdt, cdn);
	},
	hs_total_cost: function (frm) {
		update_costing_hardware_row(frm);
	},
});

frappe.ui.form.on("BOM Powder Coating Summary", {
	pcts_total_area: async function (frm, cdt, cdn) {
		const powder_item = locals[cdt][cdn];
		await update_costing_powder_row(frm, powder_item);
	},
});

frappe.ui.form.on("BOM Final Costing Esoft", {
	weight: function (frm, cdt, cdn) {
		set_calculated_percent_value(frm, cdt, cdn);
	},
	wastage_percentage: function (frm, cdt, cdn) {
		set_calculated_percent_value(frm, cdt, cdn);
	},
	material_rate: function (frm, cdt, cdn) {
		set_costing_table_total_rate(frm, cdt, cdn);
	},
	charges_rate: function (frm, cdt, cdn) {
		set_costing_table_total_rate(frm, cdt, cdn);
	},
	total_weight: function (frm, cdt, cdn) {
		set_total_cost(frm, cdt, cdn);
	},
	total_rate: function (frm, cdt, cdn) {
		set_total_cost(frm, cdt, cdn);
	},
	total_cost: function (frm, cdt, cdn) {
		calculate_and_set_total_cost(frm);
	},
});

frappe.ui.form.on("BOM Creator Additional Cost", {
	amount: function (frm, cdt, cdn) {
		calculate_and_set_total_cost(frm);
	},
	custom_additional_costs_remove: function (frm) {
		calculate_and_set_total_cost(frm);
	},
});

function set_defaults(frm) {
	set_summary_cache(frm);
	set_operation_list(frm);
	set_groups_cache(frm);
	// update_full_summary(frm)  // Only use if want to populate summary table for old docs
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
	// frappe.local.cache use this for caching
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
	frm.operation_master_list = await get_operation_master(frm);
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

	populate_costing_summary(frm);

	refresh_summary_tables(frm);
}

function refresh_summary_tables(frm) {
	frm.refresh_field("custom_hardware_summary");
	frm.refresh_field("custom_powder_coating_summary");
	frm.refresh_field("custom_costing_summary");
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

	refresh_summary_tables(frm);
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
			const key = r.custom_range;
			powder_agg[key] = powder_agg[key] || {
				item_group: "Powder Coating",
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
		row.item_group = "Powder Coating";
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
	const idx = summary.findIndex((r) => r.range === item_row.custom_range);
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

async function populate_costing_summary(frm) {
	frm.clear_table("custom_costing_summary");
	const { hardware_and_bo_summary: summary = [] } = await fetch_customer_pricing(frm);
	const today = frappe.datetime.str_to_obj(frappe.datetime.get_today());
	let total_weight = 0;
	let total_area = 0;
	let sub_total = 0;

	// Summary Table
	for (const item of frm.doc.custom_summary || []) {
		const row = frm.add_child("custom_costing_summary");
		row.description = `${item.ig} (${item.rl} & ${item.rt})`;
		row.weight = item.bw || 0;
		row.wastage_percentage = 10;
		row.wastage_weight = calculate_percent_value(row.wastage_percentage, row.weight);
		row.total_weight = calculate_total_wastage(row.weight, row.wastage_weight);
		row.total_area = null; // Raw material based on weight, so area is null
		row.charges_rate = get_charges_rate(summary, "Raw Material", today, item.ig, item.rl);
		row.material_rate = get_material_rate(summary, today, item.rl, item.rt);
		row.total_rate = calculate_total_rate(row.charges_rate, row.material_rate);
		row.total_cost = !row.total_area
			? calculate_total_cost(row.total_weight, row.total_rate)
			: 0;

		total_weight += item.bw || 0;
		total_area += item.ar || 0;
		sub_total += row.total_cost || 0;
	}

	// Powder Coating
	for (const item of frm.doc.custom_powder_coating_summary || []) {
		if (item.item_group === "Total") continue;
		const powder_row = frm.add_child("custom_costing_summary");
		powder_row.description = `Powder Coating (${item.range})`;
		powder_row.weight = null; // Powder coating based on area, so weight is null
		powder_row.total_area = item.area || 0;
		powder_row.charges_rate = get_charges_rate(
			summary,
			"Operation Charges",
			today,
			item.item_group,
			item.range
		);
		powder_row.total_rate = calculate_total_rate(
			powder_row.charges_rate,
			powder_row.material_rate || 0
		);
		powder_row.total_cost = powder_row.total_area
			? calculate_total_cost(powder_row.total_area, powder_row.total_rate)
			: 0;

		sub_total += powder_row.total_cost || 0;
	}

	// Hardware Totals
	const hardware_row = frm.add_child("custom_costing_summary");
	hardware_row.description = "Hardware Cost";
	const hardware_total = frm.doc.custom_hardware_summary?.findLast(
		(element) => element.hs_item_name === "Total"
	);
	hardware_row.total_cost = hardware_total ? hardware_total.hs_total_cost || 0 : 0;
	sub_total += hardware_row.total_cost || 0;

	// HC Row
	const hc_row = frm.add_child("custom_costing_summary");
	hc_row.description = "H.C";

	// Operation List
	const operations_master = frm.operation_master_list || get_operation_master();
	for (const operation of operations_master || []) {
		const operation_row = frm.add_child("custom_costing_summary");
		operation_row.description = `${operation.cm_charges_name}`;
		operation_row.weight = operation.cm_type === "Weight" ? total_weight : 0;
		operation_row.total_weight = operation_row.weight;
		operation_row.total_area = operation.cm_type === "Area" ? total_area : 0;
		// Add total_cost calculation if needed for operations
	}

	// Total Rows
	const sub_total_row = frm.add_child("custom_costing_summary");
	sub_total_row.description = "Sub Total";
	sub_total_row.total_cost = sub_total || 0;

	const development_row = frm.add_child("custom_costing_summary");
	development_row.description = "Development Cost";

	const final_row = frm.add_child("custom_costing_summary");
	final_row.description = "Final Cost";
	final_row.total_cost = sub_total || 0; // Adjust if development cost is added

	frm.doc.raw_material_cost = sub_total || 0;
	frm.refresh_field("raw_material_cost");
	frm.refresh_field("custom_costing_summary");
}

async function update_costing_summary_row(frm, summary_item) {
	const description = `${summary_item.ig} (${summary_item.rl} & ${summary_item.rt})`;
	const row = frm.doc.custom_costing_summary.find((r) => r.description === description);
	if (!row) return;

	row.weight = summary_item.bw || 0;
	row.wastage_weight = calculate_percent_value(row.wastage_percentage || 10, row.weight);
	row.total_weight = calculate_total_wastage(row.weight, row.wastage_weight);
	row.total_rate = calculate_total_rate(row.charges_rate, row.material_rate);
	row.total_cost = !row.total_area ? calculate_total_cost(row.total_weight, row.total_rate) : 0;

	frm.refresh_field("custom_costing_summary");
}

async function update_costing_powder_row(frm, powder_item) {
	const description = `Powder Coating (${powder_item.range})`;
	const row = frm.doc.custom_costing_summary.find((r) => r.description === description);
	if (!row) return;

	row.total_area = powder_item.area || 0;
	frm.refresh_field("custom_costing_summary");
}

async function update_costing_hardware_row(frm) {
	const hardware_row = frm.doc.custom_costing_summary.find(
		(r) => r.description === "Hardware Cost"
	);
	if (!hardware_row) return;

	const hardware_total = frm.doc.custom_hardware_summary?.find(
		(row) => row.hs_item_name === "Total"
	);
	hardware_row.total_cost = hardware_total ? hardware_total.hs_total_cost || 0 : 0;

	frm.refresh_field("custom_costing_summary");
}

async function update_costing_operation_rows(frm) {
	const total_weight = frm.doc.custom_summary.reduce((sum, item) => sum + (item.bw || 0), 0);
	const total_area = frm.doc.custom_summary.reduce((sum, item) => sum + (item.ar || 0), 0);

	frm.doc.custom_costing_summary.forEach((row) => {
		if (row.row_type === "operation") {
			// Find the corresponding operation from stored data
			const operation = frm.operation_master_list.find(
				(op) => op.cm_charges_name === row.description
			);
			if (operation) {
				row.weight = operation.cm_type === "Weight" ? total_weight : 0;
				row.total_weight = row.weight;
				row.total_area = operation.cm_type === "Area" ? total_area : 0;
			}
		}
	});

	frm.refresh_field("custom_costing_summary");
}

// function calculate_and_set_total_cost(frm) {
// 	const rows = frm.doc.custom_costing_summary || [];
// 	if (rows.length >= 3) {
// 		const sum_rows = rows.slice(0, -3);
// 		const sub_total = sum_rows.reduce(
// 			(sum, item) => sum + (parseFloat(item.total_cost) || 0),
// 			0
// 		);

// 		const sub_total_row = rows[rows.length - 3];
// 		sub_total_row.total_cost = sub_total;

// 		const development_charges = parseFloat(rows[rows.length - 2].total_cost) || 0;

// 		const total_cost = sub_total + development_charges;

// 		const total_row = rows[rows.length - 1];
// 		total_row.total_cost = total_cost;

// 		const additional_costs = frm.doc.custom_additional_costs || [];
// 		const total_additional_cost = additional_costs.reduce(
// 			(sum, item) => sum + (parseFloat(item.amount) || 0),
// 			0
// 		);
// 		frm.doc.raw_material_cost = total_cost + total_additional_cost;
// 		frm.refresh_field("raw_material_cost");
// 		frm.refresh_field("custom_costing_summary");
// 	}
// }
function calculate_summary_sub_total(rows) {
	const sum_rows = rows.slice(0, -3);
	return sum_rows.reduce((sum, item) => sum + (parseFloat(item.total_cost) || 0), 0);
}

function calculate_total_additional_cost(frm) {
	const additional_costs = frm.doc.custom_additional_costs || [];
	return additional_costs.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
}

function update_total_in_summary_table(frm, sub_total) {
	const rows = frm.doc.custom_costing_summary;

	rows[rows.length - 3].total_cost = sub_total;

	const development_charges = parseFloat(rows[rows.length - 2].total_cost) || 0;

	const total_cost = sub_total + development_charges;
	rows[rows.length - 1].total_cost = total_cost;

	return total_cost;
}

function calculate_and_set_total_cost(frm) {
	const costing_rows = frm.doc.custom_costing_summary || [];

	if (costing_rows.length < 3) {
		return;
	}

	const sub_total = calculate_summary_sub_total(costing_rows);

	const summary_total = update_total_in_summary_table(frm, sub_total);

	const additional_cost_total = calculate_total_additional_cost(frm);

	frm.doc.raw_material_cost = summary_total + additional_cost_total;

	frm.refresh_field("raw_material_cost");
	frm.refresh_field("custom_costing_summary");
}
async function get_operation_master() {
	return await frappe.db.get_list("Operation Charges Master", {
		filters: {
			is_valid_in_costing_summary: 1,
		},
		fields: ["cm_charges_name", "cm_type"],
		limit: 50,
	});
}

async function calculate_summary_total(frm) {
	let total_weight = 0;
	let total_area = 0;
	frm.doc.custom_summary.forEach(async (item) => {
		total_weight += item.bw;
		total_area += item.ar;
	});
	return { total_weight, total_area };
}
function set_costing_table_total_rate(frm, cdt, cdn) {
	const row = locals[cdt][cdn];
	const total_rate = calculate_total_rate(row.charges_rate, row.material_rate);
	frappe.model.set_value(cdt, cdn, "total_rate", total_rate);
}

function calculate_total_rate(charges_rate, material_rate) {
	const charge = parseFloat(charges_rate) || 0;
	const material = parseFloat(material_rate) || 0;
	return parseFloat((charge + material).toFixed(3));
}

function calculate_total_wastage(weight, wastage_weight) {
	const w = parseFloat(weight) || 0;
	const wastage = parseFloat(wastage_weight) || 0;
	return parseFloat((w - wastage).toFixed(3));
}

function calculate_total_cost(value, total_rate) {
	const val = parseFloat(value) || 0;
	const rate = parseFloat(total_rate) || 0;
	return parseFloat((val * rate).toFixed(3));
}

function calculate_percent_value(percentage, total) {
	const percent = parseFloat(percentage) || 0;
	const tot = parseFloat(total) || 0;
	return parseFloat(((percent / 100) * tot).toFixed(3));
}

function set_total_cost(frm, cdt, cdn) {
	const row = locals[cdt][cdn];

	const total_area = parseFloat(row.total_area) || 0;
	const total_weight = parseFloat(row.total_weight) || 0;
	const total_rate = parseFloat(row.total_rate) || 0;

	let total_cost = 0;

	if (total_area > 0) {
		total_cost = calculate_total_cost(total_area, total_rate);
	} else if (total_weight > 0) {
		total_cost = calculate_total_cost(total_weight, total_rate);
	}

	frappe.model.set_value(cdt, cdn, "total_cost", parseFloat(total_cost.toFixed(2)) || 0);
}

function set_total_wastage(frm, cdt, cdn) {
	const row = locals[cdt][cdn];
	frappe.model.set_value(
		cdt,
		cdn,
		"total_weight",
		calculate_total_wastage(row.weight, row.wastage_weight)
	);
}

function get_material_rate(summary, today, range_length, range_thickness) {
	const expected_label =
		range_thickness === "Till 3 MM" ? "Punching, Bending & Fab." : "Laser, Bending & Fab.";

	return (
		summary
			.filter(
				(row) =>
					row.type === "Operation Charges" &&
					row.selected_item === expected_label &&
					row.range === range_length &&
					(!row.valid_from || frappe.datetime.str_to_obj(row.valid_from) <= today) &&
					(!row.valid_till || frappe.datetime.str_to_obj(row.valid_till) >= today)
			)
			.sort((a, b) => {
				const a_from = a.valid_from ? frappe.datetime.str_to_obj(a.valid_from) : 0;
				const b_from = b.valid_from ? frappe.datetime.str_to_obj(b.valid_from) : 0;
				return b_from - a_from;
			})
			.map((r) => parseFloat(r.rate) || 0)[0] || 0
	);
}

function get_charges_rate(summary, row_type, today, item_group, range_val) {
	return (
		summary
			.filter(
				(row) =>
					row.type === row_type &&
					row.selected_item === item_group &&
					row.range === range_val &&
					(!row.valid_from || frappe.datetime.str_to_obj(row.valid_from) <= today) &&
					(!row.valid_till || frappe.datetime.str_to_obj(row.valid_till) >= today)
			)
			.sort((a, b) => {
				const b_from = b.valid_from ? frappe.datetime.str_to_obj(b.valid_from) : 0;
				const a_from = a.valid_from ? frappe.datetime.str_to_obj(a.valid_from) : 0;
				return b_from - a_from;
			})
			.map((r) => parseFloat(r.rate) || 0)[0] || 0
	);
}

function set_calculated_percent_value(frm, cdt, cdn) {
	const row = locals[cdt][cdn];

	if (row.description === "H.C" || row.description === "Development Cost") {
		const current_idx = row.idx || 1;
		const previous_rows = frm.doc.custom_costing_summary || [];
		const previous_row = previous_rows.find((r) => r.idx === current_idx - 1);

		if (previous_row.total_cost) {
			const previous_total_cost = parseFloat(previous_row.total_cost) || 0;
			const wastage_percentage = parseFloat(row.wastage_percentage) || 0;
			const wastage_amount = calculate_percent_value(
				wastage_percentage,
				previous_total_cost
			);
			const new_total_cost = wastage_amount;

			frappe.model.set_value(
				cdt,
				cdn,
				"total_cost",
				parseFloat(new_total_cost.toFixed(3)) || 0
			);
		}
	} else {
		const percent_value = calculate_percent_value(
			row.wastage_percentage || 0,
			row.weight || 0
		);
		frappe.model.set_value(
			cdt,
			cdn,
			"wastage_weight",
			parseFloat(percent_value.toFixed(3)) || 0
		);
		set_total_wastage(frm, cdt, cdn);
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
