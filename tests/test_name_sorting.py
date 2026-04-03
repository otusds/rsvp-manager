"""Tests for nobility particle-aware last name sorting."""
import pytest
from rsvp_manager.utils import get_last_name_sort_key


class TestGetLastNameSortKey:
    """Unit tests for the sort key function."""

    # --- Lowercase particles: should sort by the word AFTER the particle ---

    def test_french_lowercase_de(self):
        assert get_last_name_sort_key("de Séjournet") == "séjournet"

    def test_french_lowercase_du(self):
        assert get_last_name_sort_key("du Plessis") == "plessis"

    def test_french_lowercase_des(self):
        assert get_last_name_sort_key("des Étangs") == "étangs"

    def test_dutch_lowercase_van(self):
        assert get_last_name_sort_key("van Beethoven") == "beethoven"

    def test_dutch_lowercase_van_der(self):
        assert get_last_name_sort_key("van der Berg") == "berg"

    def test_dutch_lowercase_van_den(self):
        assert get_last_name_sort_key("van den Heuvel") == "heuvel"

    def test_dutch_lowercase_ten(self):
        assert get_last_name_sort_key("ten Bosch") == "bosch"

    def test_german_lowercase_von(self):
        assert get_last_name_sort_key("von Humboldt") == "humboldt"

    def test_german_lowercase_vom(self):
        assert get_last_name_sort_key("vom Stein") == "stein"

    def test_german_lowercase_zu(self):
        assert get_last_name_sort_key("zu Guttenberg") == "guttenberg"

    def test_german_compound_von_und_zu(self):
        assert get_last_name_sort_key("von und zu Liechtenstein") == "liechtenstein"

    def test_spanish_lowercase_de_la(self):
        assert get_last_name_sort_key("de la Cruz") == "cruz"

    def test_portuguese_lowercase_da(self):
        assert get_last_name_sort_key("da Silva") == "silva"

    def test_portuguese_lowercase_dos(self):
        assert get_last_name_sort_key("dos Santos") == "santos"

    def test_italian_lowercase_di(self):
        assert get_last_name_sort_key("di Marco") == "marco"

    def test_italian_lowercase_da(self):
        assert get_last_name_sort_key("da Vinci") == "vinci"

    def test_french_lowercase_d_apostrophe(self):
        assert get_last_name_sort_key("d'Artagnan") == "artagnan"

    def test_french_lowercase_l_apostrophe(self):
        assert get_last_name_sort_key("l'Hôpital") == "hôpital"

    def test_scandinavian_lowercase_af(self):
        assert get_last_name_sort_key("af Kleen") == "kleen"

    def test_arabic_lowercase_al(self):
        assert get_last_name_sort_key("al-Rashid") == "rashid"

    def test_arabic_lowercase_el(self):
        assert get_last_name_sort_key("el-Amin") == "amin"

    # --- Capitalized particles: should sort ON the particle ---

    def test_capitalized_De(self):
        assert get_last_name_sort_key("De Ridder") == "de ridder"

    def test_capitalized_Van(self):
        assert get_last_name_sort_key("Van Damme") == "van damme"

    def test_capitalized_Van_der(self):
        assert get_last_name_sort_key("Van der Merwe") == "van der merwe"

    def test_capitalized_Von(self):
        assert get_last_name_sort_key("Von Trapp") == "von trapp"

    def test_capitalized_Le(self):
        assert get_last_name_sort_key("Le Pen") == "le pen"

    def test_capitalized_La(self):
        assert get_last_name_sort_key("La Guardia") == "la guardia"

    def test_capitalized_Di(self):
        assert get_last_name_sort_key("Di Caprio") == "di caprio"

    def test_capitalized_Del(self):
        assert get_last_name_sort_key("Del Toro") == "del toro"

    def test_capitalized_Della(self):
        assert get_last_name_sort_key("Della Robbia") == "della robbia"

    def test_capitalized_D_apostrophe(self):
        assert get_last_name_sort_key("D'Angelo") == "d'angelo"

    # --- Space-separated variants (apostrophe/hyphen replaced by space) ---

    def test_lowercase_d_space(self):
        assert get_last_name_sort_key("d Artagnan") == "artagnan"

    def test_lowercase_l_space(self):
        assert get_last_name_sort_key("l Hôpital") == "hôpital"

    def test_lowercase_t_space(self):
        assert get_last_name_sort_key("t Hooft") == "hooft"

    def test_lowercase_al_space(self):
        assert get_last_name_sort_key("al Rashid") == "rashid"

    # --- Smart/curly quotes (iOS and Mac auto-replace straight quotes) ---

    def test_smart_quote_d(self):
        assert get_last_name_sort_key("d\u2019Artagnan") == "artagnan"

    def test_smart_quote_D_capitalized(self):
        assert get_last_name_sort_key("D\u2019Angelo") == "d'angelo"

    def test_smart_quote_l(self):
        assert get_last_name_sort_key("l\u2019Hôpital") == "hôpital"

    def test_smart_quote_t(self):
        assert get_last_name_sort_key("\u2019t Hooft") == "hooft"

    def test_left_quote_d(self):
        assert get_last_name_sort_key("d\u2018Artagnan") == "artagnan"

    # --- 't particle (Dutch) ---

    def test_straight_t_particle(self):
        assert get_last_name_sort_key("'t Hooft") == "hooft"

    def test_smart_t_particle_in_compound(self):
        """van 't with smart quote should still work."""
        assert get_last_name_sort_key("van \u2019t Hooft") == "hooft"

    # --- Edge cases ---

    def test_empty_string(self):
        assert get_last_name_sort_key("") == ""

    def test_none(self):
        assert get_last_name_sort_key(None) == ""

    def test_no_particle(self):
        assert get_last_name_sort_key("Smith") == "smith"

    def test_particle_only(self):
        # "de" alone with no remainder should not strip (len check)
        assert get_last_name_sort_key("de") == "de"

    def test_particle_with_space_only(self):
        # "de " alone — no remainder after stripping
        assert get_last_name_sort_key("de ") == "de "

    def test_single_word_no_match(self):
        assert get_last_name_sort_key("Dupont") == "dupont"


class TestSortOrder:
    """Verify that names sort in the correct relative order."""

    def test_de_lowercase_sorts_at_surname(self):
        names = ["de Séjournet", "De Ridder", "Dupont", "Martin"]
        sorted_names = sorted(names, key=get_last_name_sort_key)
        # De Ridder → "de ridder" (D), Dupont → "dupont" (D), Martin → "martin" (M), de Séjournet → "séjournet" (S)
        assert sorted_names == ["De Ridder", "Dupont", "Martin", "de Séjournet"]

    def test_van_lowercase_vs_capitalized(self):
        names = ["van Beethoven", "Van Damme", "Adams"]
        sorted_names = sorted(names, key=get_last_name_sort_key)
        # Adams → "adams" (A), van Beethoven → "beethoven" (B), Van Damme → "van damme" (V)
        assert sorted_names == ["Adams", "van Beethoven", "Van Damme"]

    def test_mixed_cultures(self):
        names = ["von Humboldt", "da Silva", "Le Pen", "Smith", "de Gaulle"]
        sorted_names = sorted(names, key=get_last_name_sort_key)
        # de Gaulle → "gaulle" (G), von Humboldt → "humboldt" (H), Le Pen → "le pen" (L), da Silva → "silva" (S), Smith → "smith" (S)
        assert sorted_names == ["de Gaulle", "von Humboldt", "Le Pen", "da Silva", "Smith"]
