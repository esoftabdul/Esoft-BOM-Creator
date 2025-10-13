frappe.ui.form.on("Item", {
    refresh: async function (frm) {
    },
    custom_length: async function (frm) {
        calculate_blank_weight(frm)
    },
    custom_width: async function (frm) {
        calculate_blank_weight(frm)
    },
    custom_thickness: async function (frm) {
        calculate_blank_weight(frm)
    },

});

function calculate_blank_weight(frm) {
    const length = frm.doc.custom_length;
    const width = frm.doc.custom_width;
    const thickness = frm.doc.custom_thickness;
    frappe.db.get_value("Item Group", frm.doc.item_group, "custom_density").then((r) => {

        const density = r.message.custom_density ? r.message.custom_density : 0;
        if (length && width && thickness && density) {
            const weight = (length * width * thickness * density) / 1000000;
            frm.set_value("custom_weight", weight);
        }
    });


}
