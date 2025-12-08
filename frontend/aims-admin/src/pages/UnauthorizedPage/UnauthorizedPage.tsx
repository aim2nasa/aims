import { useNavigate } from 'react-router-dom';
import { Button } from '@/shared/ui/Button';
import './UnauthorizedPage.css';

export const UnauthorizedPage = () => {
  const navigate = useNavigate();

  return (
    <div className="unauthorized-page">
      <div className="unauthorized-card">
        <h1 className="unauthorized-card__title">403</h1>
        <h2 className="unauthorized-card__subtitle">접근 권한이 없습니다</h2>
        <p className="unauthorized-card__message">
          이 페이지는 관리자 권한이 필요합니다.
          <br />
          권한이 필요하시면 시스템 관리자에게 문의해주세요.
        </p>
        <div className="unauthorized-card__actions">
          <Button onClick={() => navigate('/login')}>
            로그인 페이지로 돌아가기
          </Button>
          <Button variant="secondary" onClick={() => window.close()}>
            창 닫기
          </Button>
        </div>
      </div>
    </div>
  );
};
