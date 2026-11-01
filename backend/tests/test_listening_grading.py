"""逐句听写判分的归一化规则（B01 验收项：规则必须有单测）。

判分完全在服务端（``app.services.listening_service.grade``），前端只展示结果。
这里的用例锁住**规则本身**，不是某一句素材：改归一化行为必须先让这些断言红。

规则现状（读 ``normalized_words``）：
- NFKC 归一（全角标点/数字折成半角）→ 小写 → 弯引号折成直引号 → 去掉所有撇号；
- 只保留 ``[a-z0-9]+``，所以标点与连字符都变成词边界；
- ``correct`` 要求归一化后的词序列**完全一致**（空原句永远不算对）；
- ``accuracy`` 是词级匹配数 / 两侧词数较大者；``diff`` 按序列比对给出 equal /
  replace / delete（漏听）/ insert（多写）。
"""

import pytest

from app.services.listening_service import grade, normalized_words

pytestmark = pytest.mark.unit


class TestNormalizedWords:
    def test_lowercases_and_drops_punctuation(self):
        assert normalized_words("Hello, World!") == ["hello", "world"]

    def test_full_width_punctuation_is_folded(self):
        assert normalized_words("Hello，World。") == ["hello", "world"]

    def test_apostrophes_are_removed_without_splitting_the_word(self):
        assert normalized_words("I don't know") == ["i", "dont", "know"]
        assert normalized_words("I don’t know") == ["i", "dont", "know"]

    def test_hyphens_split_words(self):
        assert normalized_words("well-known") == ["well", "known"]

    def test_digits_are_kept_as_tokens(self):
        assert normalized_words("3 apples") == ["3", "apples"]

    def test_whitespace_variants_collapse(self):
        assert normalized_words("  a \t b\n c ") == ["a", "b", "c"]


class TestGrade:
    def test_case_and_punctuation_do_not_matter(self):
        result = grade("I don't know.", "i dont know")
        assert result["correct"] is True
        assert result["accuracy"] == 100
        assert [part["kind"] for part in result["diff"]] == ["equal"]

    def test_curly_and_straight_apostrophe_are_equivalent(self):
        assert grade("I don’t know", "I don't know")["correct"] is True

    def test_hyphenated_reference_accepts_two_words(self):
        assert grade("well-known", "well known")["correct"] is True

    def test_empty_answer_is_wrong_with_zero_accuracy(self):
        result = grade("I have two cats", "")
        assert result["correct"] is False
        assert result["accuracy"] == 0

    def test_empty_reference_is_never_correct(self):
        result = grade("", "")
        assert result["correct"] is False
        assert result["accuracy"] == 0

    def test_missing_word_shows_as_delete(self):
        result = grade("I have two cats", "I have cats")
        assert result["correct"] is False
        delete = [part for part in result["diff"] if part["kind"] == "delete"]
        assert delete and delete[0]["expected"] == "two"

    def test_extra_word_shows_as_insert(self):
        result = grade("I have cats", "I have two cats")
        assert result["correct"] is False
        insert = [part for part in result["diff"] if part["kind"] == "insert"]
        assert insert and insert[0]["actual"] == "two"

    def test_wrong_word_shows_as_replace(self):
        result = grade("I have two cats", "I have too cats")
        assert result["correct"] is False
        replace = [part for part in result["diff"] if part["kind"] == "replace"]
        assert replace and replace[0]["expected"] == "two" and replace[0]["actual"] == "too"

    def test_accuracy_is_word_level_match_ratio(self):
        # 原句 4 词、答出 3 词且顺序未乱：匹配 3 词 / 较大词数 4 → 75%。
        result = grade("I have two cats", "I have cats")
        assert result["accuracy"] == 75

    def test_numbers_are_not_synonyms_of_spelled_out_numbers(self):
        assert grade("I have 2 cats", "I have two cats")["correct"] is False
