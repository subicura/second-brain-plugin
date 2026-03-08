import { Notice, Platform, PluginSettingTab, Setting } from "obsidian";
import type { App } from "obsidian";
import type { ClaudeModel } from "./types";
import type SecondBrainPlugin from "./main";
import { FolderSuggest } from "./settings/FolderSuggest";

export class SecondBrainSettingTab extends PluginSettingTab {
    plugin: SecondBrainPlugin;

    constructor(app: App, plugin: SecondBrainPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl).setName("Claude").setHeading();

        new Setting(containerEl)
            .setName("Claude 활성화")
            .setDesc("파일 메뉴에서 Claude 기능을 사용합니다 (Desktop 전용)")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.claudeEnabled)
                    .onChange(async (value) => {
                        this.plugin.settings.claudeEnabled = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("모델")
            .setDesc("사용할 Claude 모델을 선택합니다")
            .addDropdown((dropdown) =>
                dropdown
                    .addOption("sonnet", "Sonnet")
                    .addOption("opus", "Opus")
                    .setValue(this.plugin.settings.claudeModel)
                    .onChange(async (value) => {
                        this.plugin.settings.claudeModel = value as ClaudeModel;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("프롬프트 폴더")
            .setDesc("프롬프트 템플릿 파일이 있는 폴더 경로. 템플릿에서 {{content}}, {{fileName}} 사용 가능")
            .addSearch((cb) => {
                new FolderSuggest(this.app, cb.inputEl);
                cb.setPlaceholder("IO_SecondBrain/프롬프트")
                    .setValue(this.plugin.settings.claudePromptFolder)
                    .onChange(async (value) => {
                        this.plugin.settings.claudePromptFolder = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl).setName("Git 동기화").setHeading();

        if (!Platform.isDesktopApp) {
            new Setting(containerEl)
                .setName("비밀번호 / Personal Access Token")
                .setDesc("모바일은 isomorphic-git을 사용하며, push/pull을 위해 GitHub PAT가 필요합니다")
                .addText((text) => {
                    text.inputEl.type = "password";
                    text
                        .setPlaceholder("ghp_xxxx...")
                        .setValue(this.plugin.getPassword())
                        .onChange(async (value) => {
                            this.plugin.setPassword(value);
                        });
                });
        }

        new Setting(containerEl)
            .setName("커밋 메시지")
            .setDesc("{{date}}를 사용하면 현재 시간으로 치환됩니다")
            .addText((text) =>
                text
                    .setPlaceholder("vault backup: {{date}}")
                    .setValue(this.plugin.settings.commitMessage)
                    .onChange(async (value) => {
                        this.plugin.settings.commitMessage = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("날짜 형식")
            .setDesc("커밋 메시지의 {{date}} 치환 형식 (Moment.js)")
            .addText((text) =>
                text
                    .setPlaceholder("YYYY-MM-DD HH:mm:ss")
                    .setValue(this.plugin.settings.commitDateFormat)
                    .onChange(async (value) => {
                        this.plugin.settings.commitDateFormat = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("자동 동기화 간격 (분)")
            .setDesc("0으로 설정하면 자동 동기화를 비활성화합니다")
            .addText((text) =>
                text
                    .setPlaceholder("5")
                    .setValue(String(this.plugin.settings.autoSyncInterval))
                    .onChange(async (value) => {
                        const num = Math.max(0, parseInt(value) || 0);
                        this.plugin.settings.autoSyncInterval = num;
                        await this.plugin.saveSettings();
                        this.plugin.setupAutoSync();
                    })
            );

        new Setting(containerEl).setName("저장소").setHeading();

        if (this.plugin.repos.length === 0) {
            containerEl.createEl("p", {
                text: "감지된 git 저장소가 없습니다. '저장소 재탐지' 커맨드를 실행해주세요.",
                cls: "setting-item-description",
            });
        } else {
            containerEl.createEl("p", {
                text: `${this.plugin.repos.length}개의 저장소가 감지되었습니다. 토글을 끄면 동기화에서 제외됩니다.`,
                cls: "setting-item-description",
            });

            for (const repo of this.plugin.repos) {
                const repoPath = repo.info.path;
                const isEnabled = !this.plugin.settings.disabledRepos.includes(repoPath);
                const status = this.plugin.getSyncStatus(repoPath);

                let desc = repoPath || "/";
                if (status) {
                    const icon = status.success ? "✅" : "❌";
                    desc += ` — ${icon} ${status.time}`;
                    if (status.error) {
                        desc += ` (${status.error})`;
                    }
                }

                const setting = new Setting(containerEl)
                    .setName(repo.info.name)
                    .setDesc(desc);

                if (status?.error) {
                    setting.addButton((btn) =>
                        btn
                            .setIcon("copy")
                            .setTooltip("오류 복사")
                            .onClick(() => {
                                navigator.clipboard.writeText(
                                    `[${repo.info.name}] ${status.time}\n${status.error}`
                                );
                                new Notice("오류가 클립보드에 복사되었습니다");
                            })
                    );
                }

                setting.addToggle((toggle) =>
                    toggle
                        .setValue(isEnabled)
                        .onChange(async (value) => {
                            const disabled = this.plugin.settings.disabledRepos;
                            if (value) {
                                const idx = disabled.indexOf(repoPath);
                                if (idx !== -1) disabled.splice(idx, 1);
                            } else {
                                if (!disabled.includes(repoPath)) {
                                    disabled.push(repoPath);
                                }
                            }
                            await this.plugin.saveSettings();
                        })
                );
            }
        }
    }
}
