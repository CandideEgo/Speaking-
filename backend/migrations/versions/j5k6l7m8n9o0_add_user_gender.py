"""Add users.gender (默认头像跟随用户的性别).

Revision ID: j5k6l7m8n9o0
Revises: i4j5k6l7m8n9
Create Date: 2026-09-22 12:00:00.000000

默认头像此前按用户 id 哈希随机指派男/女线描插画：约一半用户被永久分配异性卡通，
除上传真实头像外无纠正途径——而「不必上传头像」正是默认头像的存在理由。

修法是把插画挂到用户的性别上：``gender`` 存 "male" / "female"，个人资料里填一次
即可。曾考虑过另加一列让用户直接挑哪张插画，但那只是一张默认图的临时占位，用户
随时可以上传替换，不值得为它单独造一个概念；性别本身就是用户资料里的真实一格，
可以承载这个决定，也能被别的功能使用，因此不提供独立的插画选择器。

列可空 + 无 server_default：性别是用户自己说的话，66 支存量行无从推断，也不该替
他们编造。NULL 即「未填」，前端此时仍按用户 id 哈希兜底，行为对存量账号不变。
取值在应用层校验（``UserUpdate`` 的 ``Literal["male", "female"]``），不加 DB 级约束，
与同表的 ``level`` / ``plan_source`` 同形态。
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "j5k6l7m8n9o0"
down_revision: str | None = "i4j5k6l7m8n9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("gender", sa.String(length=10), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "gender")
