from django.test import SimpleTestCase

from apps.legacy_migration.location import resolve_locations


class ResolveLocationsTests(SimpleTestCase):
    def test_three_or_more_char_token_is_always_trusted(self):
        names = {"1": "CAMISA VALVULA TRASIEGO PERKINS 354 B147"}
        result = resolve_locations(names)

        self.assertEqual(result["1"].location_code, "B147")
        self.assertEqual(result["1"].clean_name, "CAMISA VALVULA TRASIEGO PERKINS 354")
        self.assertIsNone(result["1"].low_confidence_token)

    def test_dot_glued_suffix_is_also_detected(self):
        names = {"1": "ARANDELA RACOR BRONCE/HULE B.LINEAL.D198"}
        result = resolve_locations(names)

        self.assertEqual(result["1"].location_code, "D198")
        self.assertEqual(result["1"].clean_name, "ARANDELA RACOR BRONCE/HULE B.LINEAL")

    def test_two_char_token_needs_to_repeat_to_be_trusted(self):
        names = {
            "1": "CUÑA BOMBA CATERPILLAR H3",
            "2": "CUÑA TRANSFERENCIA BOMBA MAZDA H3",
            "3": "ARANDELA SHIM DIAFRAGMA E1",  # aparece una sola vez
        }
        result = resolve_locations(names)

        self.assertEqual(result["1"].location_code, "H3")
        self.assertEqual(result["2"].location_code, "H3")

        self.assertIsNone(result["3"].location_code)
        self.assertEqual(result["3"].low_confidence_token, "E1")
        self.assertEqual(result["3"].clean_name, "ARANDELA SHIM DIAFRAGMA E1")  # sin tocar

    def test_no_trailing_token_is_left_untouched(self):
        names = {"1": "CIGUEÑAL FORD 5000"}
        result = resolve_locations(names)

        self.assertIsNone(result["1"].location_code)
        self.assertIsNone(result["1"].low_confidence_token)
        self.assertEqual(result["1"].clean_name, "CIGUEÑAL FORD 5000")
