import TemplateCenter from "./TemplateCenter.jsx";
import "./documentTemplates.css";

export default function DocumentTemplateAdminRoute({ service, permissions, data }) {
  if (!service) return <div className="dt-empty">Сервис шаблонов не подключён.</div>;
  if (permissions?.templateView === "none") return <div className="dt-empty">Доступ к шаблонам закрыт.</div>;
  return <TemplateCenter service={service} permissions={permissions} data={data} />;
}
