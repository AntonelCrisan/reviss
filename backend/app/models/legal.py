import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class LegalDocument(Base):
    __tablename__ = "legal_documents"
    __table_args__ = (
        UniqueConstraint("slug", "locale", name="uq_legal_documents_slug_locale"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(80), nullable=False)
    # A translated document is a document in its own right: its own sections,
    # its own revision date, published independently of the Romanian original.
    # Romanian is the authoritative version and the fallback for every lookup.
    locale: Mapped[str] = mapped_column(
        String(8),
        nullable=False,
        default="ro",
        server_default="ro",
    )
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    last_date_modified: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    sections: Mapped[list[LegalDocumentSection]] = relationship(
        back_populates="document",
        cascade="all, delete-orphan",
        order_by="LegalDocumentSection.sort_order",
        passive_deletes=True,
    )


class LegalDocumentSection(Base):
    __tablename__ = "legal_document_sections"
    __table_args__ = (
        UniqueConstraint(
            "document_id",
            "section_key",
            name="uq_legal_document_sections_document_id_section_key",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("legal_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    section_key: Mapped[str] = mapped_column(String(80), nullable=False)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)
    last_date_modified: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    document: Mapped[LegalDocument] = relationship(back_populates="sections")


class CompanyData(Base):
    __tablename__ = "company_data"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    social_location: Mapped[str] = mapped_column(Text, nullable=False)
    cui: Mapped[str] = mapped_column(Text, nullable=False)
    register_number: Mapped[str] = mapped_column(Text, nullable=False)
    social_capital: Mapped[str] = mapped_column(Text, nullable=False)
    email: Mapped[str] = mapped_column(Text, nullable=False)
    privacy_email: Mapped[str] = mapped_column(Text, nullable=False)
    phone: Mapped[str] = mapped_column(Text, nullable=False)
    ai_provider: Mapped[str] = mapped_column(Text, nullable=False)
    payment_provider: Mapped[str] = mapped_column(Text, nullable=False)
    hosting_provider: Mapped[str] = mapped_column(Text, nullable=False)
    social_facebook_url: Mapped[str] = mapped_column(Text, nullable=False, default="")
    social_instagram_url: Mapped[str] = mapped_column(Text, nullable=False, default="")
    social_tiktok_url: Mapped[str] = mapped_column(Text, nullable=False, default="")
    social_linkedin_url: Mapped[str] = mapped_column(Text, nullable=False, default="")
    social_youtube_url: Mapped[str] = mapped_column(Text, nullable=False, default="")
    social_x_url: Mapped[str] = mapped_column(Text, nullable=False, default="")
    last_date_modified: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
