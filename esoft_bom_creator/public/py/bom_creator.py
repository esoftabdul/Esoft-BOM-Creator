from collections import defaultdict

import frappe
from erpnext.manufacturing.doctype.bom_creator.bom_creator import BOMCreator


class BomCreator(BOMCreator):
	def set_rate_for_items(self):
		"""
		Overrides the parent method to prevent rate calculation from running on save.
		"""
		pass
