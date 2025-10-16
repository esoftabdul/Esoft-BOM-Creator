frappe.ui.form.on("BOM Creator", {
	refresh: async function (frm) {
		set_defaults(frm);
	},
	custom_customer: function (frm) {
		map_summary_tables(frm);
	},
	custom_repopulate_costing: function (frm) { repopulate_costing_summary(frm); }
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
		// set_length_range(cdt, cdn);
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
		// update_summary_for_row(frm, cdt, cdn);
	},
	custom_blwt: (frm, cdt, cdn) => {
		handle_item_change(frm, cdt, cdn);
	},
	custom_area_sqft: (frm, cdt, cdn) => {
		handle_item_change(frm, cdt, cdn);
		// update_summary_for_row(frm, cdt, cdn);
	},
	custom_add_operation: (frm, cdt, cdn) => {
		open_operation_dialog(frm, cdt, cdn);
	},
});

frappe.ui.form.on("BOM Material Summary", {
	bw: function (frm, cdt, cdn) {
		const summary_item = locals[cdt][cdn];
		update_costing_summary_row(frm, summary_item);
		update_costing_operation_rows(frm);
	},
	ar: function (frm, cdt, cdn) {
		const summary_item = locals[cdt][cdn];
		update_costing_summary_row(frm, summary_item);
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
	area: async function (frm, cdt, cdn) {
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
		update_costing_additional_row(frm);
	},
	custom_additional_costs_remove: function (frm) {
		update_costing_additional_row(frm);
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

	// frappe.model.set_value(cdt, cdn, "custom_density", density);

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

	const row_values = {
		range_length: row.custom_range,
		new_range: row.custom_length > 3000 ? "Above 3 Mtrs" : "Till 3 Mtrs",
		blwt: row.custom_blwt,
		area: row.custom_area_sqft,
		new_blwt: blwt,
		new_area: area,
		qty: row.qty,
	};

	update_summary_for_row(row_values, frm, cdt, cdn);
	set_length_range(cdt, cdn);
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
	// const item = locals[cdt][cdn];

	// if (!item.custom_material) return;

	// const old_values = item.old_values || {};

	// const new_values = {
	// 	material: item.custom_material,
	// 	thickness: item.custom_rangethickness,
	// 	range: item.custom_range,
	// 	blwt: item.custom_blwt,
	// 	area: item.custom_area_sqft,
	// };
	update_full_summary(frm)

	// if (old_values.material) {
	// 	const old_key = `${old_values.material}|${old_values.thickness}|${old_values.range}`;
	// 	if (frm.summary_cache.has(old_key)) {
	// 		const summary_entry = frm.summary_cache.get(old_key);
	// 		summary_entry.bw -= parseFloat(old_values.blwt) || 0;
	// 		summary_entry.ar -= parseFloat(old_values.area) || 0;
	// 		if (summary_entry.bw === 0 && summary_entry.ar === 0) {
	// 			frm.summary_cache.delete(old_key);
	// 		}
	// 	}
	// }

	// const new_key = `${new_values.material}|${new_values.thickness}|${new_values.range}`;
	// if (!frm.summary_cache.has(new_key)) {
	// 	frm.summary_cache.set(new_key, {
	// 		ig: new_values.material,
	// 		rt: new_values.thickness,
	// 		rl: new_values.range,
	// 		bw: 0,
	// 		ar: 0,
	// 	});
	// }
	// const summary_entry = frm.summary_cache.get(new_key);
	// summary_entry.bw += parseFloat(new_values.blwt) || 0;
	// summary_entry.ar += parseFloat(new_values.area) || 0;

	// update_summary_table(frm);

	await sync_costing_material_rows(frm);
	update_costing_operation_rows(frm);
	calculate_and_set_total_cost(frm);

	// item.old_values = { ...new_values };
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

function update_summary_for_row(row_values, frm, cdt, cdn) {
	const row = locals[cdt][cdn];

	const d_qty = (parseFloat(row.qty) || 0) - (row.custom_previous_qty || 0);
	const new_area = parseFloat(row_values.new_area) || 0;
	const old_area = parseFloat(row_values.area) || 0;
	const old_range = row_values.range_length;
	const new_range = row_values.new_range;
	const selected_ops = (row.custom_msf || "")
		.split(",")
		.map(op => op.trim())
		.filter(Boolean);

	if (frm.hw_groups.includes(row.item_group)) {
		adjust_hardware_row(frm, row, d_qty);
		frappe.model.set_value(cdt, cdn, "custom_previous_qty", parseFloat(row.qty) || 0);
		recalc_hardware_totals(frm);
	}

	if (selected_ops.some(op => op.toLowerCase().includes("powder"))) {
		let summary = frm.doc.custom_powder_coating_summary || [];

		if (old_range === new_range || !old_range) {
			const delta = new_area - old_area;

			if (delta !== 0 || new_area > 0) {
				const idx = summary.findIndex((r) => r.range === new_range);

				if (idx === -1) {
					if (new_area > 0) {

						const current_length = summary.length;
						frm.doc.custom_powder_coating_summary.pop();
						const new_row = frm.add_child("custom_powder_coating_summary");
						frappe.model.set_value(
							new_row.doctype,
							new_row.name,
							"item_group",
							"Powder Coating"
						);
						frappe.model.set_value(new_row.doctype, new_row.name, "range", new_range);
						frappe.model.set_value(new_row.doctype, new_row.name, "area", new_area);
						frm.refresh_field("custom_powder_coating_summary");
						summary = frm.doc.custom_powder_coating_summary;

						const total_row = frm.add_child("custom_powder_coating_summary");
						frappe.model.set_value(
							total_row.doctype,
							total_row.name,
							"item_group",
							"Total"
						);
						frappe.model.set_value(total_row.doctype, total_row.name, "range", "");
						frappe.model.set_value(total_row.doctype, total_row.name, "area", 0);
						// If the previous last row was Total, swap to keep Total last
						if (current_length > 0 && summary[current_length - 1].range === "Total") {
							const temp = summary[current_length];
							summary[current_length] = summary[current_length - 1];
							summary[current_length - 1] = temp;
							frm.refresh_field("custom_powder_coating_summary");
						}
					}
				} else {
					const srow = summary[idx];

					const updated_area = (parseFloat(srow.area) || 0) + delta;
					if (updated_area <= 0) {
						// Remove row
						frm.doc.custom_powder_coating_summary.splice(idx, 1);
						frm.refresh_field("custom_powder_coating_summary");
					} else {
						frappe.model.set_value(srow.doctype, srow.name, "area", updated_area);
					}
				}
			}
		} else {
			if (old_area > 0 && old_range) {
				const old_idx = summary.findIndex((r) => r.range === old_range);

				if (old_idx !== -1) {
					const srow = summary[old_idx];
					const updated_area = (parseFloat(srow.area) || 0) - old_area;
					if (updated_area <= 0) {
						frm.doc.custom_powder_coating_summary.splice(old_idx, 1);
						frm.refresh_field("custom_powder_coating_summary");
					} else {
						frappe.model.set_value(srow.doctype, srow.name, "area", updated_area);
					}
				}
			}

			// Add to new range
			if (new_area > 0 && new_range) {
				const idx = summary.findIndex((r) => r.range === new_range);
				if (idx === -1) {
					// Add new row
					frm.doc.custom_powder_coating_summary.pop();
					const new_row = frm.add_child("custom_powder_coating_summary");
					frappe.model.set_value(
						new_row.doctype,
						new_row.name,
						"item_group",
						"Powder Coating"
					);
					frappe.model.set_value(new_row.doctype, new_row.name, "range", new_range);
					frappe.model.set_value(new_row.doctype, new_row.name, "area", new_area);
					frm.refresh_field("custom_powder_coating_summary");
					summary = frm.doc.custom_powder_coating_summary;

					// Re-add Total row
					const total_row = frm.add_child("custom_powder_coating_summary");
					frappe.model.set_value(
						total_row.doctype,
						total_row.name,
						"item_group",
						"Total"
					);
					frappe.model.set_value(total_row.doctype, total_row.name, "range", "");
					frappe.model.set_value(total_row.doctype, total_row.name, "area", 0);
				} else {
					const srow = summary[idx];

					const updated_area = (parseFloat(srow.area) || 0) + new_area;
					if (updated_area <= 0) {
						frm.doc.custom_powder_coating_summary.splice(idx, 1);
						frm.refresh_field("custom_powder_coating_summary");
					} else {
						frappe.model.set_value(srow.doctype, srow.name, "area", updated_area);
					}
				}
			}
		}
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
		const selected_ops = (r.custom_msf || "")
			.split(",")
			.map(op => op.trim())
			.filter(Boolean);

		if (hw_groups.includes(r.item_group)) {
			hardware_agg[r.item_code] = hardware_agg[r.item_code] || {
				item_code: r.item_code,
				qty: 0,
			};
			hardware_agg[r.item_code].qty += qty;
		}
		if (selected_ops.some(op => op.toLowerCase().includes("powder"))) {

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

	if (idx === -1) {
		// To handle adding new hardware row, but since the user may have this bug too, we can add logic similar to above, but for now, assuming it's handled in other places or add if needed.
		return;
	}

	const srow = summary[idx];
	const new_qty = (parseFloat(srow.hs_qty) || 0) + d_qty;
	const new_cost = new_qty * (parseFloat(srow.hs_unit_price) || 0);

	frappe.model.set_value(srow.doctype, srow.name, "hs_qty", new_qty);
	frappe.model.set_value(srow.doctype, srow.name, "hs_total_cost", new_cost);
}

function adjust_powder_row(frm, item_row, d_area) {
	const summary = frm.doc.custom_powder_coating_summary || [];
	const idx = summary.findIndex((r) => r.range === item_row.custom_range);

	if (idx === -1) {
		const new_row = frm.add_child("custom_powder_coating_summary");

		frappe.model.set_value(new_row.doctype, new_row.name, "range", item_row.custom_range);
		frappe.model.set_value(
			new_row.doctype,
			new_row.name,
			"area",
			(parseFloat(new_row.area) || 0) + (parseFloat(d_area) || 0)
		);

		frm.refresh_field("custom_powder_coating_summary");

		return;
	}

	const srow = summary[idx];
	const new_area = (parseFloat(srow.area) || 0) + (parseFloat(d_area) || 0);
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
	// ADD: Create key-value pairs for rl & rt combinations
	const rl_rt_summary = {};

	let total_weight = 0;
	let total_area = 0;
	let sub_total = 0;
	let laser_operation = false;
	let punching_operation = false;

	// ADD: First pass to build rl_rt_summary
	for (const item of frm.doc.custom_summary || []) {
		const key = `${item.rl} & ${item.rt}`;
		if (!rl_rt_summary[key]) {
			rl_rt_summary[key] = {
				ig: item.ig,
				rl: item.rl,
				rt: item.rt,
				total_weight: 0,
				total_area: 0,
				items: []
			};
		}

		const weight = item.bw || 0;
		const area = item.ar || 0;
		rl_rt_summary[key].total_weight += weight;
		rl_rt_summary[key].total_area += area;
		rl_rt_summary[key].items.push(item);
	}

	// Store the summary in frm.doc for later use
	frm.doc.rl_rt_summary = rl_rt_summary;
	// Summary Table
	for (const item of frm.doc.custom_summary || []) {
		if (laser_operation == false) {
			if (item.rt == "Above 3 MM") {
				laser_operation = true;
			}
		}
		if (punching_operation == false) {
			if (item.rt == "Till 3 MM") {
				punching_operation = true;
			}
		}
		const row = frm.add_child("custom_costing_summary");
		row.description = `${item.ig} (${item.rl} & ${item.rt})`;
		row.weight = item.bw || 0;
		row.wastage_percentage = 10;
		row.wastage_weight = calculate_percent_value(row.wastage_percentage, row.weight);
		row.total_weight = calculate_total_wastage(row.weight, row.wastage_weight);
		row.total_area = null; // Raw material based on weight, so area is null
		row.material_rate = get_charges_rate(summary, "Raw Material", today, item.ig, item.rl);
		// row.material_rate = get_material_rate(summary, today, item.rl, item.rt);
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

	// Operation List - Modified logic for Laser and Punching
	const operations_master = frm.operation_master_list || get_operation_master();
	for (const operation of operations_master || []) {
		if (operation.cm_charges_name.toLowerCase().includes("laser") && !laser_operation) {
			continue;
		}
		if (operation.cm_charges_name.toLowerCase().includes("punching") && !punching_operation) {
			continue;
		}

		// Special handling for Laser operation - Always create 2 rows if laser_operation is true
		if (operation.cm_charges_name.toLowerCase().includes("laser") && laser_operation) {
			const rl_categories = ["Above 3 Mtrs", "Till 3 Mtrs"];

			rl_categories.forEach(rl_category => {
				// Filter keys that match the RL category and Above 3 MM
				const matching_keys = Object.keys(rl_rt_summary).filter(key =>
					key.includes(rl_category) && key.includes("Above 3 MM")
				);

				if (matching_keys.length > 0) {
					// Calculate total weight for this specific RL category
					const category_weight = matching_keys.reduce((sum, key) =>
						sum + (rl_rt_summary[key].total_weight || 0), 0
					);

					// Create separate row for each RL category
					const laser_row = frm.add_child("custom_costing_summary");
					laser_row.description = `${operation.cm_charges_name} - ${rl_category}`;
					laser_row.weight = operation.cm_type === "Weight" ? category_weight : 0;
					laser_row.total_weight = laser_row.weight;
					laser_row.total_area = operation.cm_type === "Area" ?
						matching_keys.reduce((sum, key) => sum + (rl_rt_summary[key].total_area || 0), 0) : 0;

					// Get specific rate for this RL category
					laser_row.charges_rate = get_material_rate(
						summary,
						today,
						operation.cm_charges_name,
						rl_category
					);

					laser_row.total_rate = calculate_total_rate(
						laser_row.charges_rate,
						laser_row.material_rate || 0
					);

					// Calculate cost based on type
					if (operation.cm_type === "Weight" && laser_row.total_weight > 0) {
						laser_row.total_cost = calculate_total_cost(laser_row.total_weight, laser_row.total_rate);
						sub_total += laser_row.total_cost || 0;
					} else if (operation.cm_type === "Area" && laser_row.total_area > 0) {
						laser_row.total_cost = calculate_total_cost(laser_row.total_area, laser_row.total_rate);
						sub_total += laser_row.total_cost || 0;
					}
				}
			});
			continue; // Skip the main operation row since we created 2 specific rows
		}

		// Special handling for Punching operation - Similar logic but for Till 3 MM
		if (operation.cm_charges_name.toLowerCase().includes("punching") && punching_operation) {
			const rl_categories = ["Above 3 Mtrs", "Till 3 Mtrs"];

			rl_categories.forEach(rl_category => {
				// Filter keys that match the RL category and Till 3 MM
				const matching_keys = Object.keys(rl_rt_summary).filter(key =>
					key.includes(rl_category) && key.includes("Till 3 MM")
				);

				if (matching_keys.length > 0) {
					// Calculate total weight for this specific RL category
					const category_weight = matching_keys.reduce((sum, key) =>
						sum + (rl_rt_summary[key].total_weight || 0), 0
					);

					// Create separate row for each RL category
					const punching_row = frm.add_child("custom_costing_summary");
					punching_row.description = `${operation.cm_charges_name} - ${rl_category}`;
					punching_row.weight = operation.cm_type === "Weight" ? category_weight : 0;
					punching_row.total_weight = punching_row.weight;
					punching_row.total_area = operation.cm_type === "Area" ?
						matching_keys.reduce((sum, key) => sum + (rl_rt_summary[key].total_area || 0), 0) : 0;

					// Get specific rate for this RL category
					punching_row.charges_rate = get_material_rate(
						summary,
						today,
						operation.cm_charges_name,
						rl_category
					);

					punching_row.total_rate = calculate_total_rate(
						punching_row.charges_rate,
						punching_row.material_rate || 0
					);

					// Calculate cost based on type
					if (operation.cm_type === "Weight" && punching_row.total_weight > 0) {
						punching_row.total_cost = calculate_total_cost(punching_row.total_weight, punching_row.total_rate);
						sub_total += punching_row.total_cost || 0;
					} else if (operation.cm_type === "Area" && punching_row.total_area > 0) {
						punching_row.total_cost = calculate_total_cost(punching_row.total_area, punching_row.total_rate);
						sub_total += punching_row.total_cost || 0;
					}
				}
			});
			continue;
		}

		// Original logic for other operations (unchanged)
		const operation_row = frm.add_child("custom_costing_summary");
		operation_row.description = `${operation.cm_charges_name}`;
		operation_row.weight = operation.cm_type === "Weight" ? total_weight : 0;
		operation_row.total_weight = operation_row.weight;
		operation_row.total_area = operation.cm_type === "Area" ? total_area : 0;

		const length_range = operation_row.total_weight > 3000 ? "Above 3 Mtrs" : "Till 3 Mtrs";
		operation_row.charges_rate = get_material_rate(summary, today, operation_row.description, length_range);
		operation_row.total_rate = calculate_total_rate(
			operation_row.charges_rate,
			operation_row.material_rate || 0
		);
		if (operation.cm_type === "Weight" && operation_row.total_weight > 0) {
			operation_row.total_cost = operation_row.total_weight
				? calculate_total_cost(operation_row.total_weight, operation_row.total_rate)
				: 0;
			sub_total += operation_row.total_cost || 0;
		}
		if (operation.cm_type === "Area" && operation_row.total_area > 0) {
			operation_row.total_cost = operation_row.total_area
				? calculate_total_cost(operation_row.total_area, operation_row.total_rate)
				: 0;
			sub_total += operation_row.total_cost || 0;
		} else if (!operation_row.total_area && !operation_row.total_weight && operation_row.total_rate) {
			operation_row.total_cost = operation_row.total_rate || 0;
			sub_total += operation_row.total_cost || 0;
		}
	}

	// Total Rows
	const sub_total_row = frm.add_child("custom_costing_summary");
	sub_total_row.description = "Sub Total";
	sub_total_row.total_cost = sub_total || 0;

	const development_row = frm.add_child("custom_costing_summary");
	development_row.description = "Development Cost";

	const additional_cost = frm.add_child("custom_costing_summary");
	additional_cost.description = "Additional Cost";
	additional_cost.total_cost = 0;

	const final_row = frm.add_child("custom_costing_summary");
	final_row.description = "Final Cost";
	final_row.total_cost = sub_total || 0; // Adjust if development cost is added

	frm.doc.raw_material_cost = sub_total || 0;
	frm.refresh_field("raw_material_cost");
	frm.refresh_field("custom_costing_summary");
}

function update_costing_summary_row(frm, summary_item) {
	const description = `${summary_item.ig} (${summary_item.rl} & ${summary_item.rt})`;
	const row = frm.doc.custom_costing_summary.find((r) => r.description === description);
	console.log(description, row);

	if (!row) return;
	console.log("updating row", row);


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
	calculate_and_set_total_cost(frm);
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
	calculate_and_set_total_cost(frm);
	frm.refresh_field("custom_costing_summary");
}

async function update_costing_additional_row(frm) {
	const additional_row = frm.doc.custom_costing_summary.find(
		(r) => r.description === "Additional Cost"
	);
	if (!additional_row) return;

	const additional_total = calculate_total_additional_cost(frm);
	additional_row.total_cost = additional_total || 0;
	calculate_and_set_total_cost(frm);
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
	calculate_and_set_total_cost(frm);
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
	const sum_rows = rows.slice(0, -4);

	return sum_rows.reduce((sum, item) => sum + (parseFloat(item.total_cost) || 0), 0);
}

function calculate_total_additional_cost(frm) {
	const additional_costs = frm.doc.custom_additional_costs || [];
	return additional_costs.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
}

function update_total_in_summary_table(frm, sub_total) {
	const rows = frm.doc.custom_costing_summary;

	rows[rows.length - 4].total_cost = sub_total;
	const development_row = rows[rows.length - 3];

	const development_charges = parseFloat(calculate_percent_value(
		development_row.wastage_percentage || 0,
		sub_total
	)) || 0;
	development_row.total_cost = development_charges;

	const additional_cost = parseFloat(rows[rows.length - 2].total_cost) || 0;

	const total_cost = sub_total + development_charges + additional_cost;
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

	frm.doc.raw_material_cost = summary_total;

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
	return parseFloat((w + wastage).toFixed(3));
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
	} else if (!total_area && !total_weight && total_rate) {
		total_cost = total_rate;
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

function get_material_rate(summary, today, name, range_length) {

	return (
		summary
			.filter(
				(row) =>
					row.type === "Operation Charges" &&
					row.selected_item === name &&
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
	if (row.description === "Sub Total" || row.description === "Additional Cost" || row.description === "Final Cost") {
		return;
	}

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
		frappe.msgprint("The price list for the selected customer is not available.");
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

async function sync_costing_material_rows(frm) {
	// Rebuild rl_rt_summary from current custom_summary
	const rl_rt_summary = {};
	for (const item of frm.doc.custom_summary || []) {
		const key = `${item.rl} & ${item.rt}`;
		if (!rl_rt_summary[key]) {
			rl_rt_summary[key] = {
				ig: item.ig,
				rl: item.rl,
				rt: item.rt,
				total_weight: 0,
				total_area: 0,
				items: []
			};
		}

		const weight = item.bw || 0;
		const area = item.ar || 0;
		rl_rt_summary[key].total_weight += weight;
		rl_rt_summary[key].total_area += area;
		rl_rt_summary[key].items.push(item);
	}
	frm.doc.rl_rt_summary = rl_rt_summary;

	// Calculate new totals
	const total_weight = frm.doc.custom_summary.reduce((sum, item) => sum + (parseFloat(item.bw) || 0), 0);
	const total_area = frm.doc.custom_summary.reduce((sum, item) => sum + (parseFloat(item.ar) || 0), 0);

	// Update material rows (existing logic)
	const material_rows = [];
	for (const row of frm.doc.custom_costing_summary || []) {
		if (row.description && row.description.startsWith("Powder")) {
			break; // Stop at the first powder coating row
		}
		if (row.description && row.description.includes(" & ")) {
			material_rows.push(row);
		}
	}

	for (const costing_row of material_rows) {
		// Extract the item group (ig) from description using regex
		const match = costing_row.description.match(/^[^(]+/);
		const item_group = match ? match[0].trim() : null;

		if (!item_group) continue;

		// Extract range length (rl) and range thickness (rt) from description
		const range_match = costing_row.description.match(/\((\w.*?) & (\w.*?)\)/);
		const range_length = range_match ? range_match[1] : null;
		const range_thickness = range_match ? range_match[2] : null;

		if (!range_length || !range_thickness) continue;

		// Find corresponding row in custom_summary
		const summary_row = frm.doc.custom_summary.find(
			(s) =>
				s.ig === item_group &&
				s.rl === range_length &&
				s.rt === range_thickness
		);

		if (!summary_row) continue;

		// Update only weight-related fields, preserving other fields
		const new_weight = parseFloat(summary_row.bw) || 0;
		const new_wastage_weight = calculate_percent_value(10, new_weight);
		const new_total_weight = calculate_total_wastage(new_weight, new_wastage_weight);
		const existing_total_rate = parseFloat(costing_row.total_rate) || 0;

		frappe.model.set_value(
			costing_row.doctype,
			costing_row.name,
			"weight",
			new_weight
		);
		frappe.model.set_value(
			costing_row.doctype,
			costing_row.name,
			"wastage_weight",
			new_wastage_weight
		);
		frappe.model.set_value(
			costing_row.doctype,
			costing_row.name,
			"total_weight",
			new_total_weight
		);
		const new_total_cost = calculate_total_cost(new_total_weight, existing_total_rate);
		frappe.model.set_value(
			costing_row.doctype,
			costing_row.name,
			"total_cost",
			new_total_cost
		);
	}

	// ADD: Update operation rows after material updates
	update_operation_rows(frm, rl_rt_summary, total_weight, total_area);

	// Refresh the grid to reflect changes
	frm.refresh_field("custom_costing_summary");

	// Recalculate totals
	calculate_and_set_total_cost(frm);
}

// ADD: New function to update operation rows
function update_operation_rows(frm, rl_rt_summary, total_weight, total_area) {
	const { hardware_and_bo_summary: summary = [] } = frm.doc; // Assuming summary is available; otherwise fetch it
	const today = frappe.datetime.get_today(); // Use string for consistency

	// Get laser and punching operations
	const laser_operation = Object.keys(rl_rt_summary).some(key => key.includes("Above 3 MM"));
	const punching_operation = Object.keys(rl_rt_summary).some(key => key.includes("Till 3 MM"));

	const operations_master = frm.operation_master_list || get_operation_master(); // Use sync version if needed

	operations_master.forEach((operation) => {
		if (operation.cm_charges_name.toLowerCase().includes("laser") && !laser_operation) {
			return;
		}
		if (operation.cm_charges_name.toLowerCase().includes("punching") && !punching_operation) {
			return;
		}

		// Handle Laser sub-rows
		if (operation.cm_charges_name.toLowerCase().includes("laser") && laser_operation) {
			const rl_categories = ["Above 3 Mtrs", "Till 3 Mtrs"];
			rl_categories.forEach(rl_category => {
				const row_description = `${operation.cm_charges_name} - ${rl_category}`;
				const laser_row = frm.doc.custom_costing_summary.find(r => r.description === row_description);
				if (!laser_row) return;

				const matching_keys = Object.keys(rl_rt_summary).filter(key =>
					key.includes(rl_category) && key.includes("Above 3 MM")
				);

				if (matching_keys.length > 0) {
					const category_weight = matching_keys.reduce((sum, key) =>
						sum + (rl_rt_summary[key].total_weight || 0), 0
					);
					const category_area = matching_keys.reduce((sum, key) =>
						sum + (rl_rt_summary[key].total_area || 0), 0
					);

					laser_row.weight = operation.cm_type === "Weight" ? category_weight : 0;
					laser_row.total_weight = laser_row.weight;
					laser_row.total_area = operation.cm_type === "Area" ? category_area : 0;

					// laser_row.charges_rate = get_material_rate(
					// 	summary,
					// 	today,
					// 	operation.cm_charges_name,
					// 	rl_category
					// );

					laser_row.total_rate = calculate_total_rate(
						laser_row.charges_rate,
						laser_row.material_rate || 0
					);

					if (operation.cm_type === "Weight" && laser_row.total_weight > 0) {
						laser_row.total_cost = calculate_total_cost(laser_row.total_weight, laser_row.total_rate);
					} else if (operation.cm_type === "Area" && laser_row.total_area > 0) {
						laser_row.total_cost = calculate_total_cost(laser_row.total_area, laser_row.total_rate);
					}
				}
			});
			return;
		}

		// Handle Punching sub-rows
		if (operation.cm_charges_name.toLowerCase().includes("punching") && punching_operation) {
			const rl_categories = ["Above 3 Mtrs", "Till 3 Mtrs"];
			rl_categories.forEach(rl_category => {
				const row_description = `${operation.cm_charges_name} - ${rl_category}`;
				const punching_row = frm.doc.custom_costing_summary.find(r => r.description === row_description);
				if (!punching_row) return;

				const matching_keys = Object.keys(rl_rt_summary).filter(key =>
					key.includes(rl_category) && key.includes("Till 3 MM")
				);

				if (matching_keys.length > 0) {
					const category_weight = matching_keys.reduce((sum, key) =>
						sum + (rl_rt_summary[key].total_weight || 0), 0
					);
					const category_area = matching_keys.reduce((sum, key) =>
						sum + (rl_rt_summary[key].total_area || 0), 0
					);

					punching_row.weight = operation.cm_type === "Weight" ? category_weight : 0;
					punching_row.total_weight = punching_row.weight;
					punching_row.total_area = operation.cm_type === "Area" ? category_area : 0;

					// punching_row.charges_rate = get_material_rate(
					// 	summary,
					// 	today,
					// 	operation.cm_charges_name,
					// 	rl_category
					// );

					punching_row.total_rate = calculate_total_rate(
						punching_row.charges_rate,
						punching_row.material_rate || 0
					);

					if (operation.cm_type === "Weight" && punching_row.total_weight > 0) {
						punching_row.total_cost = calculate_total_cost(punching_row.total_weight, punching_row.total_rate);
					} else if (operation.cm_type === "Area" && punching_row.total_area > 0) {
						punching_row.total_cost = calculate_total_cost(punching_row.total_area, punching_row.total_rate);
					}
				}
			});
			return;
		}

		// Handle other/generic operations
		const row_description = `${operation.cm_charges_name}`;
		const operation_row = frm.doc.custom_costing_summary.find(r => r.description === row_description);
		if (!operation_row) return;

		operation_row.weight = operation.cm_type === "Weight" ? total_weight : 0;
		operation_row.total_weight = operation_row.weight;
		operation_row.total_area = operation.cm_type === "Area" ? total_area : 0;

		const length_range = operation_row.total_weight > 3000 ? "Above 3 Mtrs" : "Till 3 Mtrs";
		// operation_row.charges_rate = get_material_rate(summary, today, operation_row.description, length_range);
		operation_row.total_rate = calculate_total_rate(
			operation_row.charges_rate,
			operation_row.material_rate || 0
		);
		if (operation.cm_type === "Weight" && operation_row.total_weight > 0) {
			operation_row.total_cost = calculate_total_cost(operation_row.total_weight, operation_row.total_rate);
		} else if (operation.cm_type === "Area" && operation_row.total_area > 0) {
			operation_row.total_cost = calculate_total_cost(operation_row.total_area, operation_row.total_rate);
		} else if (!operation_row.total_area && !operation_row.total_weight && operation_row.total_rate) {
			operation_row.total_cost = operation_row.total_rate || 0;
		}
	});
}



// New function to repopulate costing summary while preserving specific fields
async function repopulate_costing_summary(frm) {
	// Save existing row data to preserve wastage_percentage and rates
	const preserved_data = new Map();
	(frm.doc.custom_costing_summary || []).forEach(row => {
		preserved_data.set(row.description, {
			wastage_percentage: row.wastage_percentage,
			charges_rate: row.charges_rate,
			material_rate: row.material_rate,
			total_rate: row.total_rate,
			total_cost: row.total_cost,
		});
	});

	// Clear the costing table
	frm.clear_table("custom_costing_summary");

	// Rebuild the costing table
	const { hardware_and_bo_summary: summary = [] } = await fetch_customer_pricing(frm);
	const today = frappe.datetime.str_to_obj(frappe.datetime.get_today());

	// Build rl_rt_summary for material and operation rows
	const rl_rt_summary = {};
	let total_weight = 0;
	let total_area = 0;
	let laser_operation = false;
	let punching_operation = false;

	for (const item of frm.doc.custom_summary || []) {
		const key = `${item.rl} & ${item.rt}`;
		if (!rl_rt_summary[key]) {
			rl_rt_summary[key] = {
				ig: item.ig,
				rl: item.rl,
				rt: item.rt,
				total_weight: 0,
				total_area: 0,
				items: [],
			};
		}
		const weight = parseFloat(item.bw) || 0;
		const area = parseFloat(item.ar) || 0;
		rl_rt_summary[key].total_weight += weight;
		rl_rt_summary[key].total_area += area;
		rl_rt_summary[key].items.push(item);
		total_weight += weight;
		total_area += area;
		if (item.rt === "Above 3 MM") laser_operation = true;
		if (item.rt === "Till 3 MM") punching_operation = true;
	}
	frm.doc.rl_rt_summary = rl_rt_summary;

	// Add material rows
	for (const item of frm.doc.custom_summary || []) {
		const description = `${item.ig} (${item.rl} & ${item.rt})`;
		const row = frm.add_child("custom_costing_summary");
		row.description = description;
		row.row_type = "material";

		const pricing_row = summary.find(
			s =>
				s.type === "Raw Material" &&
				s.selected_item === item.ig &&
				s.range === item.rl &&
				(!s.valid_from || frappe.datetime.str_to_obj(s.valid_from) <= today) &&
				(!s.valid_till || frappe.datetime.str_to_obj(s.valid_till) >= today)
		);

		const material_rate = pricing_row ? parseFloat(pricing_row.rate) || 0 : 0;
		const preserved = preserved_data.get(description) || {};

		row.weight = parseFloat(item.bw) || 0;
		row.wastage_percentage = preserved.wastage_percentage || 10;
		row.wastage_weight = calculate_percent_value(row.wastage_percentage, row.weight);
		row.total_weight = calculate_total_wastage(row.weight, row.wastage_weight);
		row.material_rate = preserved.material_rate || material_rate;
		row.charges_rate = preserved.charges_rate || 0;
		row.total_rate = preserved.total_rate || calculate_total_rate(row.charges_rate, row.material_rate);
		row.total_cost = calculate_total_cost(row.total_weight, row.total_rate);
	}

	// Add powder coating rows
	for (const item of frm.doc.custom_powder_coating_summary || []) {
		if (item.item_group === "Total") continue;
		const description = `Powder Coating (${item.range})`;
		const row = frm.add_child("custom_costing_summary");
		row.description = description;
		row.row_type = "powder";

		const pricing_row = summary.find(
			s =>
				s.type === "Powder Coating" &&
				s.range === item.range &&
				(!s.valid_from || frappe.datetime.str_to_obj(s.valid_from) <= today) &&
				(!s.valid_till || frappe.datetime.str_to_obj(s.valid_till) >= today)
		);

		const material_rate = pricing_row ? parseFloat(pricing_row.rate) || 0 : 0;
		const preserved = preserved_data.get(description) || {};

		row.total_area = parseFloat(item.area) || 0;
		row.material_rate = preserved.material_rate || material_rate;
		row.charges_rate = preserved.charges_rate || 0;
		row.total_rate = preserved.total_rate || calculate_total_rate(row.charges_rate, row.material_rate);
		row.total_cost = calculate_total_cost(row.total_area, row.total_rate);
	}

	// Add operation rows
	const operations_master = frm.operation_master_list || (await get_operation_master());
	for (const operation of operations_master) {
		if (operation.cm_charges_name.toLowerCase().includes("laser") && !laser_operation) continue;
		if (operation.cm_charges_name.toLowerCase().includes("punching") && !punching_operation) continue;

		if (operation.cm_charges_name.toLowerCase().includes("laser")) {
			const rl_categories = ["Above 3 Mtrs", "Till 3 Mtrs"];
			for (const rl_category of rl_categories) {
				const matching_keys = Object.keys(rl_rt_summary).filter(key => key.includes(rl_category) && key.includes("Above 3 MM"));
				if (matching_keys.length === 0) continue;

				const description = `${operation.cm_charges_name} - ${rl_category}`;
				const row = frm.add_child("custom_costing_summary");
				row.description = description;
				row.row_type = "operation";

				const category_weight = matching_keys.reduce(
					(sum, key) => sum + (rl_rt_summary[key].total_weight || 0),
					0
				);
				const category_area = matching_keys.reduce(
					(sum, key) => sum + (rl_rt_summary[key].total_area || 0),
					0
				);

				const pricing_row = summary.find(
					s =>
						s.type === "Operation Charges" &&
						s.selected_item === operation.cm_charges_name &&
						s.range === rl_category &&
						(!s.valid_from || frappe.datetime.str_to_obj(s.valid_from) <= today) &&
						(!s.valid_till || frappe.datetime.str_to_obj(s.valid_till) >= today)
				);

				const charges_rate = pricing_row ? parseFloat(pricing_row.rate) || 0 : 0;
				const preserved = preserved_data.get(description) || {};

				row.weight = operation.cm_type === "Weight" ? category_weight : 0;
				row.total_weight = row.weight;
				row.total_area = operation.cm_type === "Area" ? category_area : 0;
				row.charges_rate = preserved.charges_rate || charges_rate;
				row.material_rate = preserved.material_rate || 0;
				row.total_rate = preserved.total_rate || calculate_total_rate(row.charges_rate, row.material_rate);
				row.total_cost =
					operation.cm_type === "Weight" && row.total_weight > 0
						? calculate_total_cost(row.total_weight, row.total_rate)
						: operation.cm_type === "Area" && row.total_area > 0
							? calculate_total_cost(row.total_area, row.total_rate)
							: row.total_rate || 0;
			}
		} else if (operation.cm_charges_name.toLowerCase().includes("punching")) {
			const rl_categories = ["Above 3 Mtrs", "Till 3 Mtrs"];
			for (const rl_category of rl_categories) {
				const matching_keys = Object.keys(rl_rt_summary).filter(key => key.includes(rl_category) && key.includes("Till 3 MM"));
				if (matching_keys.length === 0) continue;

				const description = `${operation.cm_charges_name} - ${rl_category}`;
				const row = frm.add_child("custom_costing_summary");
				row.description = description;
				row.row_type = "operation";

				const category_weight = matching_keys.reduce(
					(sum, key) => sum + (rl_rt_summary[key].total_weight || 0),
					0
				);
				const category_area = matching_keys.reduce(
					(sum, key) => sum + (rl_rt_summary[key].total_area || 0),
					0
				);

				const pricing_row = summary.find(
					s =>
						s.type === "Operation Charges" &&
						s.selected_item === operation.cm_charges_name &&
						s.range === rl_category &&
						(!s.valid_from || frappe.datetime.str_to_obj(s.valid_from) <= today) &&
						(!s.valid_till || frappe.datetime.str_to_obj(s.valid_till) >= today)
				);

				const charges_rate = pricing_row ? parseFloat(pricing_row.rate) || 0 : 0;
				const preserved = preserved_data.get(description) || {};

				row.weight = operation.cm_type === "Weight" ? category_weight : 0;
				row.total_weight = row.weight;
				row.total_area = operation.cm_type === "Area" ? category_area : 0;
				row.charges_rate = preserved.charges_rate || charges_rate;
				row.material_rate = preserved.material_rate || 0;
				row.total_rate = preserved.total_rate || calculate_total_rate(row.charges_rate, row.material_rate);
				row.total_cost =
					operation.cm_type === "Weight" && row.total_weight > 0
						? calculate_total_cost(row.total_weight, row.total_rate)
						: operation.cm_type === "Area" && row.total_area > 0
							? calculate_total_cost(row.total_area, row.total_rate)
							: row.total_rate || 0;
			}
		} else {
			const description = operation.cm_charges_name;
			const row = frm.add_child("custom_costing_summary");
			row.description = description;
			row.row_type = "operation";

			const pricing_row = summary.find(
				s =>
					s.type === "Operation Charges" &&
					s.selected_item === operation.cm_charges_name &&
					s.range === (total_weight > 3000 ? "Above 3 Mtrs" : "Till 3 Mtrs") &&
					(!s.valid_from || frappe.datetime.str_to_obj(s.valid_from) <= today) &&
					(!s.valid_till || frappe.datetime.str_to_obj(s.valid_till) >= today)
			);

			const charges_rate = pricing_row ? parseFloat(pricing_row.rate) || 0 : 0;
			const preserved = preserved_data.get(description) || {};

			row.weight = operation.cm_type === "Weight" ? total_weight : 0;
			row.total_weight = row.weight;
			row.total_area = operation.cm_type === "Area" ? total_area : 0;
			row.charges_rate = preserved.charges_rate || charges_rate;
			row.material_rate = preserved.material_rate || 0;
			row.total_rate = preserved.total_rate || calculate_total_rate(row.charges_rate, row.material_rate);
			row.total_cost =
				operation.cm_type === "Weight" && row.total_weight > 0
					? calculate_total_cost(row.total_weight, row.total_rate)
					: operation.cm_type === "Area" && row.total_area > 0
						? calculate_total_cost(row.total_area, row.total_rate)
						: row.total_rate || 0;
		}
	}

	// Add Hardware Cost row
	const hardware_total = frm.doc.custom_hardware_summary?.find(row => row.hs_item_name === "Total");
	const hardware_row = frm.add_child("custom_costing_summary");
	hardware_row.description = "Hardware Cost";
	hardware_row.row_type = "hardware";
	const preserved_hardware = preserved_data.get("Hardware Cost") || {};
	hardware_row.total_cost = hardware_total ? parseFloat(hardware_total.hs_total_cost) || 0 : 0;

	hardware_row.total_rate = preserved_hardware.total_rate || 0;

	// Add HC row
	const hc_row = frm.add_child("custom_costing_summary");
	hc_row.description = "H.C";
	hc_row.row_type = "hc";
	const preserved_hc = preserved_data.get("H.C") || {};
	hc_row.wastage_percentage = preserved_hc.wastage_percentage || 10;
	hc_row.total_cost = preserved_hc.total_cost || 0;
	// HC cost will be recalculated in calculate_and_set_total_cost

	// Add Sub Total row
	const sub_total_row = frm.add_child("custom_costing_summary");
	sub_total_row.description = "Sub Total";
	sub_total_row.row_type = "sub_total";
	const preserved_sub_total = preserved_data.get("Sub Total") || {};
	sub_total_row.wastage_percentage = preserved_sub_total.wastage_percentage || 0;
	sub_total_row.charges_rate = preserved_sub_total.charges_rate || 0;
	sub_total_row.material_rate = preserved_sub_total.material_rate || 0;
	sub_total_row.total_rate = preserved_sub_total.total_rate || 0;

	const development_charges_row = frm.add_child("custom_costing_summary");
	development_charges_row.description = "Development Cost";
	development_charges_row.row_type = "development_cost";
	const preserved_development_charges = preserved_data.get("Development Cost") || {};
	development_charges_row.wastage_percentage = preserved_development_charges.wastage_percentage || 0;
	development_charges_row.total_cost = preserved_development_charges.total_cost || 0;

	// Add Additional Cost row
	const additional_total = calculate_total_additional_cost(frm);
	const additional_row = frm.add_child("custom_costing_summary");
	additional_row.description = "Additional Cost";
	additional_row.row_type = "additional";
	const preserved_additional = preserved_data.get("Additional Cost") || {};
	additional_row.total_cost = additional_total || 0;
	additional_row.wastage_percentage = preserved_additional.wastage_percentage || 0;
	additional_row.charges_rate = preserved_additional.charges_rate || 0;
	additional_row.material_rate = preserved_additional.material_rate || 0;
	additional_row.total_rate = preserved_additional.total_rate || 0;



	// Add Final Cost row
	const final_row = frm.add_child("custom_costing_summary");
	final_row.description = "Final Cost";
	final_row.row_type = "final";
	const preserved_final = preserved_data.get("Final Cost") || {};
	final_row.wastage_percentage = preserved_final.wastage_percentage || 0;
	final_row.charges_rate = preserved_final.charges_rate || 0;
	final_row.material_rate = preserved_final.material_rate || 0;
	final_row.total_rate = preserved_final.total_rate || 0;

	// Update operation rows incrementally to ensure weights/areas are correct
	update_operation_rows(frm, rl_rt_summary, total_weight, total_area);

	// Recalculate totals
	calculate_and_set_total_cost(frm);

	// Refresh the table
	frm.refresh_field("custom_costing_summary");
}
