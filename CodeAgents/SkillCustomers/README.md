# 手写定制技能 (SkillCustomers)

本目录放置你自己手写的 SKILL.md 技能文档。安装时会和自动生成的 SkillAutoGenerate 一起，安装到勾选的平台。

## 目录结构

每个 skill 是一个子目录，里面放 SKILL.md：

    SkillCustomers/
      my-custom-skill          skill 目录名，小写字母加连字符
        SKILL.md               skill 内容
      another-skill
        SKILL.md

支持任意层级嵌套，安装时会递归查找所有含 SKILL.md 的目录。

## SKILL.md 格式

文件开头是 YAML frontmatter，name 必须和目录名一致：

    ---
    name: my-custom-skill
    description: 一句话描述这个 skill 做什么
    ---

    # 标题

    正文内容写在这里。

## 注意

- name 字段必须和目录名一致（opencode 等平台要求）。
- 安装时本目录下所有 skill 会一并复制到各平台的 skills 目录。
- 这个 README.md 不会被当成 skill 安装（安装只收集含 SKILL.md 的目录）。
