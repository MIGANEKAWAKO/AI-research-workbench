"""工具注册与执行：白名单 + 参数校验 + 结构化失败。

模型输出是不可信输入：工具名与参数必须先过白名单与 Pydantic 强校验，
任何非法调用返回 ToolResult(ok=False)，不触达真实数据层（方案文档 9 节）。
任务级预算（总调用次数）由 Orchestrator 维护，本模块只保证单次调用合法。
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, ClassVar

from pydantic import BaseModel, ValidationError

from .models import ToolResult


class ToolArgumentError(ValueError):
    """工具参数校验失败。"""


class BaseTool(ABC):
    """工具基类：子类只需定义 name/description/args_model 并实现 run。"""

    name: ClassVar[str]
    description: ClassVar[str]
    args_model: ClassVar[type[BaseModel]]

    @abstractmethod
    async def run(self, args: BaseModel) -> ToolResult:
        """执行工具；入参 args 已通过校验（args_model 实例）。"""

    def parameters_schema(self) -> dict[str, Any]:
        """OpenAI Function Calling 的 parameters 定义，单一事实源 = args_model。"""
        return self.args_model.model_json_schema()

    def validate(self, arguments: dict[str, Any]) -> BaseModel:
        """参数校验：必填/类型/长度/取值上限由 args_model 的 Field 约束保证。"""
        try:
            return self.args_model(**arguments)
        except ValidationError as exc:
            raise ToolArgumentError(f"{self.name}: {exc.errors()}") from exc


class ToolRegistry:
    """工具注册表：按名字白名单查找，负责 校验 → 执行 → 结构化失败。"""

    def __init__(self, tools: list[BaseTool]):
        self._tools: dict[str, BaseTool] = {tool.name: tool for tool in tools}

    def get(self, name: str) -> BaseTool | None:
        return self._tools.get(name)

    @property
    def names(self) -> list[str]:
        return sorted(self._tools)

    def to_openai_tools(self) -> list[dict[str, Any]]:
        """转成 OpenAI Function Calling 工具定义（DeepSeek 兼容），供 A3 Planner 使用。"""
        return [
            {
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.parameters_schema(),
                },
            }
            for name in self.names
            for tool in [self._tools[name]]
        ]

    async def run(self, name: str, arguments: dict[str, Any]) -> ToolResult:
        """白名单 → 参数校验 → 执行；任何失败都返回结构化 ToolResult，不抛异常。"""
        tool = self._tools.get(name)
        if tool is None:
            return ToolResult(ok=False, tool_name=name, error=f"未知工具: {name}")
        try:
            args = tool.validate(arguments)
        except ToolArgumentError as exc:
            return ToolResult(ok=False, tool_name=name, error=f"参数非法: {exc}")
        try:
            return await tool.run(args)
        except Exception as exc:
            return ToolResult(ok=False, tool_name=name, error=f"工具执行失败: {exc}")
