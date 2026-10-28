"""Exam-paper PDF list response schema (BE-07)."""

from pydantic import BaseModel


class ExamPdfItem(BaseModel):
    slug: str
    title: str
    subject: str
    year: int
    month: int | None = None
    set_no: int
    bytes: int


class ExamPdfListResponse(BaseModel):
    count: int
    items: list[ExamPdfItem]
